import { Router } from 'express';
import { addDays, isValidDate, localToday, weekStart } from '../lib/dates.js';
import { badRequest } from '../lib/errors.js';
import { buildWeeklySummary, goalStreak } from '../lib/stats.js';
import { validateGoal } from '../lib/validation.js';

const WEEKS_SHOWN = 8;

/** Weekly goal plus the dashboard summaries, all derived from saved sessions on each request. */
export function createStatsRouter(db) {
  const router = Router();

  const currentGoal = (userId) =>
    db.prepare('SELECT weekly_goal FROM users WHERE id = ?').get(userId).weekly_goal;

  router.get('/goal', (req, res) => {
    res.json({ weeklyTarget: currentGoal(req.user.id) });
  });

  router.put('/goal', (req, res) => {
    const { value, fields } = validateGoal(req.body);
    if (fields) throw badRequest('Please fix the highlighted fields.', fields);
    db.prepare('UPDATE users SET weekly_goal = ? WHERE id = ?').run(value.weeklyTarget, req.user.id);
    res.json({ weeklyTarget: value.weeklyTarget });
  });

  // The browser sends its own calendar date so "this week" matches the user's time zone.
  router.get('/stats/summary', (req, res) => {
    let today = localToday();
    if (req.query.today !== undefined) {
      if (!isValidDate(req.query.today)) throw badRequest('Invalid date.', { today: 'Enter a valid date.' });
      today = req.query.today;
    }
    const firstDay = addDays(weekStart(today), -7 * (WEEKS_SHOWN - 1));
    const lastDay = addDays(weekStart(today), 6);

    // One row per session, so a session counts once however many exercises it has.
    const sessions = db.prepare(
      `SELECT w.id, w.date, COALESCE(SUM(e.sets * e.reps * e.weight), 0) AS volume
         FROM workouts w LEFT JOIN exercises e ON e.workout_id = w.id
        WHERE w.user_id = ? AND w.date BETWEEN ? AND ?
        GROUP BY w.id`,
    ).all(req.user.id, firstDay, lastDay);

    const weeks = buildWeeklySummary(sessions, today, WEEKS_SHOWN);
    const goal = currentGoal(req.user.id);
    const thisWeek = weeks[weeks.length - 1];
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM workouts WHERE user_id = ?').get(req.user.id);

    res.json({
      today,
      goal,
      thisWeek: { ...thisWeek, goalMet: thisWeek.sessions >= goal },
      weeks,
      streakWeeks: goalStreak(weeks, goal),
      totalSessions: total,
    });
  });

  router.get('/stats/exercises', (req, res) => {
    const exercises = db.prepare(
      `SELECT MIN(e.name) AS name, COUNT(DISTINCT w.id) AS sessions, MAX(e.weight) AS bestWeight
         FROM exercises e JOIN workouts w ON w.id = e.workout_id
        WHERE w.user_id = ?
        GROUP BY lower(e.name)
        ORDER BY sessions DESC, name`,
    ).all(req.user.id);
    res.json({ exercises });
  });

  router.get('/stats/progress', (req, res) => {
    const name = typeof req.query.exercise === 'string' ? req.query.exercise.trim() : '';
    if (!name) throw badRequest('Choose an exercise.', { exercise: 'Choose an exercise.' });

    const points = db.prepare(
      `SELECT w.date, MAX(e.weight) AS weight, SUM(e.sets * e.reps * e.weight) AS volume
         FROM exercises e JOIN workouts w ON w.id = e.workout_id
        WHERE w.user_id = ? AND lower(e.name) = lower(?)
        GROUP BY w.date
        ORDER BY w.date`,
    ).all(req.user.id, name);

    const best = points.reduce((top, p) => (top === null || p.weight > top.weight ? p : top), null);
    res.json({ exercise: name, points, personalBest: best });
  });

  return router;
}
