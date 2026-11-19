import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './lib/errors.js';
import { createAuth } from './routes/auth.js';
import { createStatsRouter } from './routes/stats.js';
import { createWorkoutsRouter } from './routes/workouts.js';

const CLIENT_DIST = path.resolve(import.meta.dirname, '../client/dist');

/** Builds the Express app around an open database. Tests pass an in-memory database. */
export function createApp(db, { rateLimit = true, clientDist = CLIENT_DIST } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
    );
    next();
  });

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Requests that change data must be JSON. A cross-site HTML form cannot send
  // JSON, so together with the SameSite cookie this blocks CSRF.
  api.use((req, _res, next) => {
    const changesData = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'];
    if (changesData && hasBody && !req.is('application/json')) {
      return next(new HttpError(415, 'Requests must be sent as application/json.'));
    }
    next();
  });
  api.use(express.json({ limit: '100kb' }));

  const auth = createAuth(db, { rateLimit });
  api.use(auth.loadUser);
  api.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  api.use('/auth', auth.router);
  api.use('/workouts', auth.requireAuth, createWorkoutsRouter(db));
  api.use('/', auth.requireAuth, createStatsRouter(db));
  api.use((_req, _res, next) => next(new HttpError(404, 'API route not found.')));
  app.use('/api', api);

  // In production the built React app is served by this same server.
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message, fields: err.fields } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { message: 'Request body is not valid JSON.' } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { message: 'Request is too large.' } });
    }
    // Unexpected failure: log the details on the server, never send them to the browser.
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: { message: 'Something went wrong on the server. Please try again.' } });
  });

  return app;
}
