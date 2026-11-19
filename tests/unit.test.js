import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDays, isValidDate, weekStart } from '../server/lib/dates.js';
import { hashPassword, verifyPassword } from '../server/lib/password.js';
import { buildWeeklySummary, goalStreak } from '../server/lib/stats.js';
import { validateWorkout } from '../server/lib/validation.js';

describe('dates', () => {
  test('isValidDate accepts real calendar dates only', () => {
    assert.equal(isValidDate('2026-11-16'), true);
    assert.equal(isValidDate('2024-02-29'), true);
    assert.equal(isValidDate('2026-02-29'), false);
    assert.equal(isValidDate('2026-13-01'), false);
    assert.equal(isValidDate('11/16/2026'), false);
    assert.equal(isValidDate(20261116), false);
  });

  test('weekStart returns the Monday of the week', () => {
    assert.equal(weekStart('2026-11-16'), '2026-11-16'); // Monday
    assert.equal(weekStart('2026-11-18'), '2026-11-16'); // Wednesday
    assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday
    assert.equal(weekStart('2027-01-01'), '2026-12-28'); // across a year boundary
  });

  test('addDays crosses month boundaries', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });
});

describe('weekly summary', () => {
  const sessions = [
    { date: '2026-11-16', volume: 1000 },
    { date: '2026-11-18', volume: 500 },
    { date: '2026-11-15', volume: 200 }, // previous week (Sunday)
    { date: '2026-01-01', volume: 999 }, // outside the window
  ];

  test('buckets sessions into Monday-Sunday weeks, oldest first', () => {
    const weeks = buildWeeklySummary(sessions, '2026-11-19', 4);
    assert.equal(weeks.length, 4);
    assert.deepEqual(weeks.at(-1), { weekStart: '2026-11-16', weekEnd: '2026-11-22', sessions: 2, volume: 1500 });
    assert.deepEqual(weeks.at(-2), { weekStart: '2026-11-09', weekEnd: '2026-11-15', sessions: 1, volume: 200 });
    assert.equal(weeks[0].sessions, 0);
  });

  test('goalStreak counts consecutive met weeks; an unfinished current week does not break it', () => {
    const w = (...counts) => counts.map((sessions) => ({ sessions }));
    assert.equal(goalStreak(w(0, 3, 3, 3), 3), 3);
    assert.equal(goalStreak(w(3, 3, 3, 1), 3), 3);
    assert.equal(goalStreak(w(3, 0, 3, 1), 3), 1);
    assert.equal(goalStreak(w(0, 0, 0, 0), 3), 0);
  });
});

describe('workout validation', () => {
  test('trims text, accepts numeric strings, and rounds weight to two decimals', () => {
    const { value, fields } = validateWorkout(
      { date: '2026-11-10', exercises: [{ name: '  Bench   Press ', sets: '3', reps: '8', weight: '132.456', notes: ' ok ' }] },
      '2026-11-16',
    );
    assert.equal(fields, null);
    assert.deepEqual(value.exercises[0], { name: 'Bench Press', sets: 3, reps: 8, weight: 132.46, notes: 'ok' });
  });

  test('allows today and bodyweight (0 lb) but not future dates', () => {
    const exercises = [{ name: 'Pull Up', sets: 3, reps: 10, weight: 0 }];
    assert.equal(validateWorkout({ date: '2026-11-16', exercises }, '2026-11-16').fields, null);
    assert.ok(validateWorkout({ date: '2026-11-20', exercises }, '2026-11-16').fields.date);
  });

  test('rejects non-object input without throwing', () => {
    for (const body of [null, undefined, 'text', 42, []]) {
      assert.ok(validateWorkout(body, '2026-11-16').fields);
    }
  });
});

test('passwords are salted and verified without storing plain text', async () => {
  const a = await hashPassword('secret-password');
  const b = await hashPassword('secret-password');
  assert.notEqual(a, b);
  assert.ok(!a.includes('secret-password'));
  assert.equal(await verifyPassword('secret-password', a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
  assert.equal(await verifyPassword('secret-password', 'garbage'), false);
});
