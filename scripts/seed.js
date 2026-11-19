// Creates a demo account with about ten weeks of sample workouts so the
// dashboard, history, and charts have data to show.
//
//   npm run seed
//
// Running it again replaces the demo account's data.

import path from 'node:path';
import { openDb, transaction } from '../server/db.js';
import { addDays, localToday, weekStart } from '../server/lib/dates.js';
import { hashPassword } from '../server/lib/password.js';

const ROOT = path.resolve(import.meta.dirname, '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const DEMO = { name: 'Demo User', email: 'demo@fitlog.test', password: 'fitlog-demo-123' };

const PLAN = [
  // [day offset within week, exercises: name, sets, reps, starting weight, weekly increase]
  [0, [['Bench Press', 3, 8, 115, 5], ['Overhead Press', 3, 10, 65, 2.5], ['Tricep Pushdown', 3, 12, 40, 2.5]]],
  [2, [['Squat', 5, 5, 155, 10], ['Leg Press', 3, 10, 230, 10], ['Plank', 3, 1, 0, 0]]],
  [4, [['Deadlift', 3, 5, 185, 10], ['Barbell Row', 3, 8, 95, 5], ['Pull Up', 3, 8, 0, 0]]],
];

const db = openDb(path.resolve(ROOT, process.env.DB_FILE || './data/fitlog.db'));
const passwordHash = await hashPassword(DEMO.password);
const today = localToday();
const firstWeek = addDays(weekStart(today), -7 * 9);

const sessions = transaction(db, () => {
  db.prepare('DELETE FROM users WHERE email = ?').run(DEMO.email); // cascades to workouts
  const userId = db.prepare('INSERT INTO users (name, email, password_hash, weekly_goal) VALUES (?, ?, ?, 3)')
    .run(DEMO.name, DEMO.email, passwordHash).lastInsertRowid;
  const insertWorkout = db.prepare('INSERT INTO workouts (user_id, date) VALUES (?, ?)');
  const insertExercise = db.prepare(
    'INSERT INTO exercises (workout_id, position, name, sets, reps, weight, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  let count = 0;
  for (let week = 0; week < 10; week++) {
    PLAN.forEach(([dayOffset, exercises], dayIndex) => {
      const date = addDays(firstWeek, week * 7 + dayOffset);
      if (date > today) return;
      if ((week === 3 && dayIndex === 2) || (week === 6 && dayIndex === 1)) return; // a couple of missed days
      const workoutId = insertWorkout.run(userId, date).lastInsertRowid;
      exercises.forEach(([name, sets, reps, start, step], position) => {
        const deload = week === 5 ? -2 * step : 0;
        const notes = week === 9 && position === 0 ? 'Felt strong today' : '';
        insertExercise.run(workoutId, position, name, sets, reps, start + week * step + deload, notes);
      });
      count += 1;
    });
  }
  return count;
});

db.close();
console.log(`Seeded ${sessions} sessions for the demo account.`);
console.log(`Sign in with ${DEMO.email} and the password defined at the top of scripts/seed.js.`);
