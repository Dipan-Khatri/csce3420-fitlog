import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { HttpError, badRequest } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { validateLogin, validateRegistration } from '../lib/validation.js';

const COOKIE_NAME = 'fitlog_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// The raw token only ever lives in the browser cookie; the database stores its hash.
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  weeklyGoal: row.weekly_goal,
});

export function createAuth(db, { rateLimit = true } = {}) {
  const router = Router();
  const failedLogins = new Map(); // ip -> { count, resetAt }

  const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  });

  function startSession(res, userId) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, expiresAt);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
  }

  /** Attaches req.user when the request carries a valid session cookie. */
  function loadUser(req, _res, next) {
    const token = readCookie(req, COOKIE_NAME);
    if (token) {
      const row = db.prepare(
        `SELECT u.id, u.name, u.email, u.weekly_goal
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?`,
      ).get(hashToken(token), Date.now());
      if (row) {
        req.user = publicUser(row);
        req.sessionToken = token;
      }
    }
    next();
  }

  function requireAuth(req, _res, next) {
    if (!req.user) return next(new HttpError(401, 'Sign in to continue.'));
    next();
  }

  router.post('/register', async (req, res) => {
    const { value, fields } = validateRegistration(req.body);
    if (fields) throw badRequest('Please fix the highlighted fields.', fields);

    const emailTaken = { email: 'An account with this email already exists.' };
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(value.email)) {
      throw new HttpError(409, 'An account with this email already exists.', emailTaken);
    }
    const passwordHash = await hashPassword(value.password);
    let userId;
    try {
      userId = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(value.name, value.email, passwordHash).lastInsertRowid;
    } catch (err) {
      // Two simultaneous registrations for the same email: the UNIQUE constraint decides.
      if (String(err.message).includes('UNIQUE')) {
        throw new HttpError(409, 'An account with this email already exists.', emailTaken);
      }
      throw err;
    }
    startSession(res, userId);
    const user = db.prepare('SELECT id, name, email, weekly_goal FROM users WHERE id = ?').get(userId);
    res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', async (req, res) => {
    const now = Date.now();
    const attempts = failedLogins.get(req.ip);
    if (attempts && attempts.resetAt <= now) failedLogins.delete(req.ip);
    if (rateLimit && attempts && attempts.resetAt > now && attempts.count >= MAX_FAILED_LOGINS) {
      throw new HttpError(429, 'Too many failed sign-in attempts. Try again in a few minutes.');
    }

    const { value, fields } = validateLogin(req.body);
    if (fields) throw badRequest('Please fix the highlighted fields.', fields);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(value.email);
    const ok = user ? await verifyPassword(value.password, user.password_hash) : false;
    if (!ok) {
      const entry = failedLogins.get(req.ip) ?? { count: 0, resetAt: now + LOCKOUT_WINDOW_MS };
      entry.count += 1;
      failedLogins.set(req.ip, entry);
      // Same message for unknown email and wrong password, so accounts cannot be enumerated.
      throw new HttpError(401, 'Incorrect email or password.');
    }
    failedLogins.delete(req.ip);
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    if (req.sessionToken) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(req.sessionToken));
    }
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return { router, loadUser, requireAuth };
}
