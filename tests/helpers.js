import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

/** Starts the real Express app on a free port with an empty in-memory database. */
export async function startTestServer() {
  const db = openDb(':memory:');
  const app = createApp(db, { rateLimit: false, clientDist: '/nonexistent' });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    client: () => createClient(baseUrl),
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}

/** A tiny HTTP client that remembers the session cookie, like a browser tab. */
export function createClient(baseUrl) {
  let cookie = '';
  async function request(method, path, body, headers = {}) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON (e.g. CSV or empty) */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return {
    get: (path) => request('GET', path),
    post: (path, body, headers) => request('POST', path, body, headers),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
    register: (name, email, password = 'test-password-1') =>
      request('POST', '/api/auth/register', { name, email, password }),
  };
}

export const sampleWorkout = (overrides = {}) => ({
  date: '2026-11-10',
  exercises: [
    { name: 'Bench Press', sets: 3, reps: 8, weight: 135, notes: 'Felt strong' },
    { name: 'Squat', sets: 5, reps: 5, weight: 185, notes: '' },
  ],
  ...overrides,
});
