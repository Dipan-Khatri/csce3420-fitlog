# FitLog Workout Tracker

CSCE 3420 Internet Programming, final project.
Team: Dipan Khatri Thapa and Sagar Bhusal (Section 001).

FitLog is a responsive web application for recording resistance-training workouts. A user creates an account, logs sessions (date plus one or more exercises with sets, reps, weight in pounds, and optional notes), searches their history, and tracks progress toward a weekly session goal on a dashboard with charts.

## Features

Core features from the proposal:

| # | Feature | Where |
|---|---------|-------|
| 1 | User accounts: register, sign in, sign out, persistent session. Personal pages require sign-in. | `/register`, `/login` |
| 2 | Workout management: create, view, edit, and delete sessions with one or more exercises. | `/workouts/new`, `/workouts/:id/edit` |
| 3 | Searchable history: newest first, filter by date range and exercise name, expandable details, confirmation before delete. | `/history` |
| 4 | Progress dashboard: sessions this week, training volume, sessions-per-week chart, and a weight chart for a selected exercise. Recalculated from saved records on every load. | `/` |
| 5 | Weekly goal: set a target number of sessions per week and see completed sessions against it. Each session counts once regardless of its number of exercises. | `/goals` |

Stretch features that were also completed: CSV export of workout history, and personal-best (PB) indicators per exercise.

## Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router, Vite, JavaScript, HTML, CSS (no UI framework; charts are hand-written SVG) |
| Backend | Node.js with Express 5 (REST/JSON API) |
| Database | SQLite through Node's built-in `node:sqlite` module |
| Authentication | Server-side sessions in an HttpOnly cookie; passwords hashed with scrypt (`node:crypto`) |
| Testing | Node's built-in test runner (`node:test`) |
| Version control | Git and GitHub |

### Change from the proposal

The proposal planned Firebase (Authentication, Cloud Firestore, Hosting). The final implementation replaces Firebase with our own **Node.js/Express backend and a SQLite database**. All five proposed core features are unchanged. What moved is where the work happens:

| Proposal (Firebase) | Final (Node.js) |
|---------------------|-----------------|
| Firebase Authentication | `server/routes/auth.js`: register/login/logout, scrypt password hashing, session cookie |
| Cloud Firestore | SQLite tables `users`, `sessions`, `workouts`, `exercises` (`server/db.js`) |
| Firestore security rules | Every query is scoped by the signed-in user's id on the server (`server/routes/workouts.js`) |
| Firebase Hosting | Express serves the built React app and the API from one server |

## Requirements

- Node.js **22.13 or newer** (developed on Node 24). Check with `node -v`.
- npm (included with Node.js).

No database server, account, or API key is needed. The SQLite database file is created automatically.

## Setup and run

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Then open <http://localhost:3000>. Register a new account, or load sample data first (next section).

### Sample data (optional)

```bash
npm run seed
```

This creates a demo account with about ten weeks of workouts so the dashboard and charts have data. The demo email and password are defined at the top of [scripts/seed.js](scripts/seed.js). Running the command again resets the demo account.

### Development mode

```bash
npm run dev
```

Runs the API on port 3000 (restarting on change) and the Vite dev server on <http://localhost:5173> with hot reload. Vite forwards `/api` requests to the API.

### Configuration

All settings are optional. Copy `.env.example` to `.env` to change them.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Port the server listens on |
| `DB_FILE` | `./data/fitlog.db` | SQLite database file |
| `COOKIE_SECURE` | `false` | Set to `true` when served over HTTPS |

The repository contains no passwords, API keys, or other secrets. `node_modules/`, the database (`data/`), the build output (`client/dist/`), and `.env` are excluded by `.gitignore`.

### Deployment

The app runs as a single Node.js web service on any Node host (for example Render or Railway):

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment: `COOKIE_SECURE=true`, and point `DB_FILE` at a persistent disk so data survives restarts.

## Testing

```bash
npm test
```

Runs 25 automated tests. The API tests start the real Express app on a free port with an empty in-memory database and send real HTTP requests, so they cover routing, validation, authentication, and SQL together.

| Feature tested | Test input | Expected outcome | Actual outcome | Result |
|----------------|-----------|------------------|----------------|--------|
| Register | Valid name, email, 8+ character password | 201, user returned, HttpOnly session cookie set, no password in response | As expected | Pass |
| Register validation | Empty name, `nope` as email, 5-character password | 400 with a message for each of the three fields | As expected | Pass |
| Duplicate email | Same email in different letter case | 409 "account already exists" | As expected | Pass |
| Sign in | Correct password; wrong password; unknown email | 200; 401; 401 with the same message (no account enumeration) | As expected | Pass |
| Sign out | POST logout, then GET `/api/auth/me` | 204, then 401 (session removed on the server) | As expected | Pass |
| Protected routes | Requests without a session cookie | 401 on workouts, goal, stats, and export | As expected | Pass |
| Workout CRUD | Create 2-exercise session, read, update, delete | 201 with computed volume; changes persist; 404 after delete | As expected | Pass |
| Workout validation | Feb 30, future date, no exercises, empty name, 0 sets, 2.5 reps, negative weight, text weight | 400 naming the exact field; nothing saved | As expected | Pass |
| Malformed requests | Broken JSON; form-encoded body | 400; 415 (no server crash) | As expected | Pass |
| Data isolation | User B reads, edits, deletes, lists, exports user A's session | 404 for each; B's list and export are empty; A's data intact | As expected | Pass |
| History filters | Date range, exercise substring, `%` wildcard, paging, reversed range | Newest first; correct subsets; `%` matched literally; 400 for bad range | As expected | Pass |
| CSV export | Exercise named `=SUM(A1)` with commas and quotes in notes | Correctly quoted CSV; formula neutralised with a leading `'` | As expected | Pass |
| Weekly goal | Set 5; then 0, 15, 2.5, text, null | Saved as 5; each invalid value rejected with 400 and goal unchanged | As expected | Pass |
| Dashboard summary | 2 sessions (4 exercises) this week, 1 last week, then delete one | Counts 2 sessions, not 4; volume summed; totals drop after delete | As expected | Pass |
| Exercise progress | Same exercise logged in mixed case over two days | One point per day with the heaviest weight; personal best flagged | As expected | Pass |
| Date and week math | Leap days, Sunday/Monday boundaries, year boundary | Weeks run Monday to Sunday; invalid dates rejected | As expected | Pass |
| Password hashing | Hash the same password twice, verify right and wrong | Different salted hashes; only the right password verifies | As expected | Pass |

The interface was also tested by hand in the browser at phone and desktop widths: sign in with empty and valid input, submit an empty and an invalid workout form (messages appear under each field and focus moves to the first problem), save, filter history, edit, delete with confirmation, change the goal, sign out, and confirm that `/history` redirects to the sign-in page when signed out.

## API reference

All routes are under `/api`, use JSON, and (except register, login, and health) require the session cookie. Errors have the shape `{ "error": { "message": "...", "fields": { "fieldName": "..." } } }`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/register` | Create account: `{ name, email, password }` |
| POST | `/auth/login` | Sign in: `{ email, password }` |
| POST | `/auth/logout` | Sign out |
| GET | `/auth/me` | Current user |
| GET | `/workouts` | List sessions, newest first. Query: `from`, `to` (YYYY-MM-DD), `exercise`, `limit`, `offset` |
| POST | `/workouts` | Create: `{ date, exercises: [{ name, sets, reps, weight, notes }] }` |
| GET | `/workouts/:id` | One session |
| PUT | `/workouts/:id` | Replace a session |
| DELETE | `/workouts/:id` | Delete a session |
| GET | `/workouts/export.csv` | CSV export (same filters as the list) |
| GET | `/goal` | Weekly goal |
| PUT | `/goal` | Set goal: `{ weeklyTarget }` (1 to 14) |
| GET | `/stats/summary?today=YYYY-MM-DD` | This week, last 8 weeks, streak, totals |
| GET | `/stats/exercises` | Distinct exercise names with session count and best weight |
| GET | `/stats/progress?exercise=NAME` | Heaviest weight per day for one exercise |

## Database design

```
users     (id, name, email UNIQUE, password_hash, weekly_goal, created_at)
sessions  (token_hash PK, user_id -> users, expires_at)
workouts  (id, user_id -> users, date, created_at, updated_at)
exercises (id, workout_id -> workouts, position, name, sets, reps, weight, notes)
```

Foreign keys cascade on delete, and `CHECK` constraints enforce the same ranges as the validation code, so invalid rows cannot be stored even if a bug bypassed validation. Dashboard numbers are not stored: they are calculated from `workouts` and `exercises` on every request, so they are always consistent with the records.

## Validation, errors, and security

- Input is validated in the browser for fast feedback and again on the server, which is the authority (`server/lib/validation.js`).
- Passwords are hashed with salted scrypt. The session token is random, stored only as a SHA-256 hash, and sent in an HttpOnly, SameSite=Lax cookie.
- Every workout query includes the signed-in user's id, so one account cannot read or change another's records.
- All SQL uses bound parameters. Data-changing requests must be JSON, which together with SameSite cookies prevents cross-site request forgery.
- Repeated failed sign-ins from one address are temporarily blocked.
- Unexpected server errors are logged on the server and returned as a generic message, never a stack trace.

## Project structure

```
client/                 React app (Vite)
  src/pages/            Login, Register, Dashboard, WorkoutForm, History, Goals
  src/components/       Layout, Field, ConfirmDialog, Charts
  src/api.js            fetch wrapper and error handling
  src/auth.jsx          signed-in user context
server/
  index.js              entry point
  app.js                Express app, middleware, error handler
  db.js                 SQLite schema and connection
  routes/               auth, workouts, stats and goal
  lib/                  validation, date math, statistics, password hashing
scripts/seed.js         demo data
tests/                  API and unit tests
```
