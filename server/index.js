import path from 'node:path';
import { createApp } from './app.js';
import { openDb } from './db.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// Optional .env file (see .env.example). Real environment variables win.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // No .env file: the defaults below apply.
}

const port = Number(process.env.PORT) || 3000;
const dbFile = path.resolve(ROOT, process.env.DB_FILE || './data/fitlog.db');

const db = openDb(dbFile);
const app = createApp(db);

const server = app.listen(port, () => {
  console.log(`FitLog running at http://localhost:${port}`);
  console.log(`Database: ${dbFile}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
