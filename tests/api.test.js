import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { sampleWorkout, startTestServer } from './helpers.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });

let emailCounter = 0;
const uniqueEmail = () => `user${++emailCounter}@example.com`;

async function signedInClient(name = 'Test User') {
  const client = server.client();
  const res = await client.register(name, uniqueEmail());
  assert.equal(res.status, 201);
  return client;
}

describe('accounts', () => {
  test('register signs the user in and never returns the password', async () => {
    const client = server.client();
    const email = uniqueEmail();
    const res = await client.register('Alex', email);
    assert.equal(res.status, 201);
    assert.equal(res.json.user.email, email);
    assert.equal(res.json.user.weeklyGoal, 3);
    assert.ok(!JSON.stringify(res.json).includes('password'));
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i);

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.user.name, 'Alex');
  });

  test('register rejects invalid input with per-field messages', async () => {
    const res = await server.client().post('/api/auth/register', { name: '', email: 'nope', password: 'short' });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.json.error.fields).sort(), ['email', 'name', 'password']);
  });

  test('register rejects a duplicate email, ignoring letter case', async () => {
    const email = uniqueEmail();
    await server.client().register('First', email);
    const res = await server.client().register('Second', email.toUpperCase());
    assert.equal(res.status, 409);
    assert.ok(res.json.error.fields.email);
  });

  test('login succeeds with the right password and fails with the wrong one', async () => {
    const email = uniqueEmail();
    await server.client().register('Sam', email, 'correct-horse-9');

    const wrong = await server.client().post('/api/auth/login', { email, password: 'wrong-password' });
    assert.equal(wrong.status, 401);
    const unknown = await server.client().post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.json.error.message, wrong.json.error.message);

    const client = server.client();
    const ok = await client.post('/api/auth/login', { email, password: 'correct-horse-9' });
    assert.equal(ok.status, 200);
    assert.equal((await client.get('/api/auth/me')).status, 200);
  });

  test('logout ends the session on the server', async () => {
    const client = await signedInClient();
    assert.equal((await client.post('/api/auth/logout')).status, 204);
    assert.equal((await client.get('/api/auth/me')).status, 401);
  });

  test('personal data routes require sign-in', async () => {
    const anonymous = server.client();
    for (const path of ['/api/workouts', '/api/goal', '/api/stats/summary', '/api/workouts/export.csv']) {
      assert.equal((await anonymous.get(path)).status, 401, path);
    }
    assert.equal((await anonymous.post('/api/workouts', sampleWorkout())).status, 401);
  });
});

describe('workout sessions', () => {
  test('create, read, update, and delete a session', async () => {
    const client = await signedInClient();

    const created = await client.post('/api/workouts', sampleWorkout());
    assert.equal(created.status, 201);
    const { id } = created.json.workout;
    assert.equal(created.json.workout.exercises.length, 2);
    assert.equal(created.json.workout.totalVolume, 3 * 8 * 135 + 5 * 5 * 185);

    const fetched = await client.get(`/api/workouts/${id}`);
    assert.equal(fetched.json.workout.exercises[0].name, 'Bench Press');
    assert.equal(fetched.json.workout.exercises[0].notes, 'Felt strong');

    const updated = await client.put(`/api/workouts/${id}`, {
      date: '2026-11-11',
      exercises: [{ name: 'Deadlift', sets: 1, reps: 5, weight: 225 }],
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.workout.date, '2026-11-11');
    assert.deepEqual(updated.json.workout.exercises.map((e) => e.name), ['Deadlift']);

    assert.equal((await client.delete(`/api/workouts/${id}`)).status, 204);
    assert.equal((await client.get(`/api/workouts/${id}`)).status, 404);
    assert.equal((await client.get('/api/workouts')).json.total, 0);
  });

  test('invalid sessions are rejected and nothing is saved', async () => {
    const client = await signedInClient();
    const cases = [
      [{ date: '2026-02-30', exercises: sampleWorkout().exercises }, 'date'],
      [{ date: '2999-01-01', exercises: sampleWorkout().exercises }, 'date'],
      [{ date: '2026-11-10', exercises: [] }, 'exercises'],
      [{ date: '2026-11-10' }, 'exercises'],
      [{ date: '2026-11-10', exercises: [{ name: '', sets: 3, reps: 8, weight: 100 }] }, 'exercises.0.name'],
      [{ date: '2026-11-10', exercises: [{ name: 'Curl', sets: 0, reps: 8, weight: 100 }] }, 'exercises.0.sets'],
      [{ date: '2026-11-10', exercises: [{ name: 'Curl', sets: 3, reps: 2.5, weight: 100 }] }, 'exercises.0.reps'],
      [{ date: '2026-11-10', exercises: [{ name: 'Curl', sets: 3, reps: 8, weight: -5 }] }, 'exercises.0.weight'],
      [{ date: '2026-11-10', exercises: [{ name: 'Curl', sets: 3, reps: 8, weight: 'heavy' }] }, 'exercises.0.weight'],
    ];
    for (const [body, field] of cases) {
      const res = await client.post('/api/workouts', body);
      assert.equal(res.status, 400, field);
      assert.ok(res.json.error.fields[field], `expected an error for ${field}`);
    }
    assert.equal((await client.get('/api/workouts')).json.total, 0);
  });

  test('malformed JSON and non-JSON bodies get clear errors, not a crash', async () => {
    const client = await signedInClient();
    const broken = await client.post('/api/workouts', '{"date": ');
    assert.equal(broken.status, 400);
    const form = await client.post('/api/workouts', 'date=2026-11-10', { 'Content-Type': 'application/x-www-form-urlencoded' });
    assert.equal(form.status, 415);
  });

  test("a user cannot read, change, or delete another user's session", async () => {
    const owner = await signedInClient('Owner');
    const other = await signedInClient('Other');
    const { id } = (await owner.post('/api/workouts', sampleWorkout())).json.workout;

    assert.equal((await other.get(`/api/workouts/${id}`)).status, 404);
    assert.equal((await other.put(`/api/workouts/${id}`, sampleWorkout())).status, 404);
    assert.equal((await other.delete(`/api/workouts/${id}`)).status, 404);
    assert.equal((await other.get('/api/workouts')).json.total, 0);
    assert.equal((await other.get('/api/workouts/export.csv')).text.trim().split('\n').length, 1);
    assert.equal((await owner.get(`/api/workouts/${id}`)).status, 200);
  });

  test('history is newest first and filters by date range and exercise name', async () => {
    const client = await signedInClient();
    await client.post('/api/workouts', sampleWorkout({ date: '2026-10-01' }));
    await client.post('/api/workouts', sampleWorkout({ date: '2026-11-05' }));
    await client.post('/api/workouts', {
      date: '2026-10-20',
      exercises: [{ name: 'Overhead Press', sets: 3, reps: 10, weight: 75 }],
    });

    const all = (await client.get('/api/workouts')).json;
    assert.deepEqual(all.workouts.map((w) => w.date), ['2026-11-05', '2026-10-20', '2026-10-01']);

    const october = (await client.get('/api/workouts?from=2026-10-01&to=2026-10-31')).json;
    assert.deepEqual(october.workouts.map((w) => w.date), ['2026-10-20', '2026-10-01']);

    const press = (await client.get('/api/workouts?exercise=press')).json;
    assert.equal(press.total, 3); // "Bench Press" and "Overhead Press"
    const overhead = (await client.get('/api/workouts?exercise=OVERHEAD')).json;
    assert.deepEqual(overhead.workouts.map((w) => w.date), ['2026-10-20']);
    assert.equal((await client.get('/api/workouts?exercise=%25')).json.total, 0); // "%" is literal

    const paged = (await client.get('/api/workouts?limit=2&offset=2')).json;
    assert.equal(paged.workouts.length, 1);
    assert.equal(paged.total, 3);

    assert.equal((await client.get('/api/workouts?from=not-a-date')).status, 400);
    assert.equal((await client.get('/api/workouts?from=2026-11-02&to=2026-11-01')).status, 400);
  });

  test('CSV export contains one row per exercise and neutralises formulas', async () => {
    const client = await signedInClient();
    await client.post('/api/workouts', {
      date: '2026-11-10',
      exercises: [{ name: '=SUM(A1)', sets: 2, reps: 5, weight: 50, notes: 'has, comma and "quote"' }],
    });
    const res = await client.get('/api/workouts/export.csv');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const lines = res.text.trim().split('\r\n');
    assert.equal(lines[0], 'date,exercise,sets,reps,weight_lb,volume_lb,notes');
    assert.equal(lines[1], `2026-11-10,'=SUM(A1),2,5,50,500,"has, comma and ""quote"""`);
  });
});

describe('goals and dashboard', () => {
  test('weekly goal can be read and changed, and rejects invalid targets', async () => {
    const client = await signedInClient();
    assert.equal((await client.get('/api/goal')).json.weeklyTarget, 3);
    assert.equal((await client.put('/api/goal', { weeklyTarget: 5 })).json.weeklyTarget, 5);
    assert.equal((await client.get('/api/auth/me')).json.user.weeklyGoal, 5);
    for (const bad of [0, 15, 2.5, 'many', null]) {
      assert.equal((await client.put('/api/goal', { weeklyTarget: bad })).status, 400, String(bad));
    }
    assert.equal((await client.get('/api/goal')).json.weeklyTarget, 5);
  });

  test('summary counts each session once and recalculates when records change', async () => {
    const client = await signedInClient();
    await client.put('/api/goal', { weeklyTarget: 2 });
    // Monday 2026-11-09 to Sunday 2026-11-15 is one week.
    const first = (await client.post('/api/workouts', sampleWorkout({ date: '2026-11-09' }))).json.workout;
    await client.post('/api/workouts', sampleWorkout({ date: '2026-11-15' }));
    await client.post('/api/workouts', sampleWorkout({ date: '2026-11-08' })); // previous week

    let summary = (await client.get('/api/stats/summary?today=2026-11-12')).json;
    assert.equal(summary.thisWeek.weekStart, '2026-11-09');
    assert.equal(summary.thisWeek.sessions, 2); // two sessions, four exercises
    assert.equal(summary.thisWeek.volume, 2 * (3 * 8 * 135 + 5 * 5 * 185));
    assert.equal(summary.thisWeek.goalMet, true);
    assert.equal(summary.weeks.length, 8);
    assert.equal(summary.weeks[6].sessions, 1);
    assert.equal(summary.totalSessions, 3);

    await client.delete(`/api/workouts/${first.id}`);
    summary = (await client.get('/api/stats/summary?today=2026-11-12')).json;
    assert.equal(summary.thisWeek.sessions, 1);
    assert.equal(summary.thisWeek.goalMet, false);

    assert.equal((await client.get('/api/stats/summary?today=yesterday')).status, 400);
  });

  test('progress returns the heaviest weight per day and the personal best', async () => {
    const client = await signedInClient();
    await client.post('/api/workouts', {
      date: '2026-11-01',
      exercises: [
        { name: 'Bench Press', sets: 3, reps: 8, weight: 135 },
        { name: 'bench press', sets: 1, reps: 3, weight: 155 },
      ],
    });
    await client.post('/api/workouts', {
      date: '2026-11-08',
      exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 145 }],
    });

    const progress = (await client.get('/api/stats/progress?exercise=BENCH%20PRESS')).json;
    assert.deepEqual(progress.points.map((p) => [p.date, p.weight]), [['2026-11-01', 155], ['2026-11-08', 145]]);
    assert.equal(progress.personalBest.weight, 155);

    const names = (await client.get('/api/stats/exercises')).json.exercises;
    assert.equal(names.length, 1);
    assert.equal(names[0].sessions, 2);
    assert.equal(names[0].bestWeight, 155);

    const history = (await client.get('/api/workouts')).json.workouts;
    const flags = history.flatMap((w) => w.exercises.map((e) => [e.weight, e.isPersonalBest]));
    assert.deepEqual(flags, [[145, false], [135, false], [155, true]]);

    assert.equal((await client.get('/api/stats/progress')).status, 400);
  });
});

test('unknown API routes return JSON 404 and health check works', async () => {
  const client = await signedInClient();
  const missing = await client.get('/api/nope');
  assert.equal(missing.status, 404);
  assert.ok(missing.json.error.message);
  assert.equal((await server.client().get('/api/health')).json.status, 'ok');
});
