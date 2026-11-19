import { Router } from 'express';
import { transaction } from '../db.js';
import { isValidDate } from '../lib/dates.js';
import { badRequest, notFound } from '../lib/errors.js';
import { exerciseVolume } from '../lib/stats.js';
import { validateWorkout } from '../lib/validation.js';

const DEFAULT_PAGE = 20;
const MAX_PAGE = 100;
const MAX_EXPORT_ROWS = 5000;

/** Builds the WHERE clause shared by the history list and the CSV export. */
function buildFilter(userId, query) {
  const where = ['w.user_id = ?'];
  const params = [userId];
  const fields = {};
  const from = typeof query.from === 'string' && query.from ? query.from : null;
  const to = typeof query.to === 'string' && query.to ? query.to : null;

  if (from && !isValidDate(from)) fields.from = 'Enter a valid start date.';
  if (to && !isValidDate(to)) fields.to = 'Enter a valid end date.';
  if (!fields.from && !fields.to && from && to && from > to) {
    fields.to = 'End date must be on or after the start date.';
  }
  if (Object.keys(fields).length) throw badRequest('Please fix the filters.', fields);

  if (from) { where.push('w.date >= ?'); params.push(from); }
  if (to) { where.push('w.date <= ?'); params.push(to); }

  const term = typeof query.exercise === 'string' ? query.exercise.trim().slice(0, 60) : '';
  if (term) {
    // Escape LIKE wildcards so the search text is matched literally.
    where.push(
      "EXISTS (SELECT 1 FROM exercises e WHERE e.workout_id = w.id AND e.name LIKE ? ESCAPE '\\')",
    );
    params.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`);
  }
  return { where: where.join(' AND '), params };
}

function parsePaging(query) {
  const limit = Number.parseInt(query.limit, 10);
  const offset = Number.parseInt(query.offset, 10);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_PAGE) : DEFAULT_PAGE,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

function csvCell(value) {
  let text = String(value ?? '');
  // Stop spreadsheet apps from treating user text as a formula.
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createWorkoutsRouter(db) {
  const router = Router();

  /** Loads exercises for many sessions in one query and attaches totals and personal bests. */
  function withExercises(userId, workoutRows) {
    if (workoutRows.length === 0) return [];
    const ids = workoutRows.map((w) => w.id);
    const exerciseRows = db.prepare(
      `SELECT id, workout_id, name, sets, reps, weight, notes
         FROM exercises
        WHERE workout_id IN (${ids.map(() => '?').join(',')})
        ORDER BY workout_id, position`,
    ).all(...ids);

    const bests = new Map(
      db.prepare(
        `SELECT lower(e.name) AS name, MAX(e.weight) AS best
           FROM exercises e JOIN workouts w ON w.id = e.workout_id
          WHERE w.user_id = ?
          GROUP BY lower(e.name)`,
      ).all(userId).map((row) => [row.name, row.best]),
    );

    const byWorkout = new Map(ids.map((id) => [id, []]));
    for (const e of exerciseRows) {
      byWorkout.get(e.workout_id).push({
        id: e.id,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        notes: e.notes,
        volume: exerciseVolume(e),
        isPersonalBest: e.weight > 0 && e.weight === bests.get(e.name.toLowerCase()),
      });
    }
    return workoutRows.map((w) => {
      const exercises = byWorkout.get(w.id);
      return {
        id: w.id,
        date: w.date,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        exercises,
        totalVolume: exercises.reduce((sum, e) => sum + e.volume, 0),
      };
    });
  }

  // Scoping every lookup by user_id is what keeps one account from reading another's records.
  function findOwned(userId, idParam) {
    if (!/^\d{1,15}$/.test(idParam)) throw notFound('Workout session not found.');
    const row = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?')
      .get(Number(idParam), userId);
    if (!row) throw notFound('Workout session not found.');
    return row;
  }

  function insertExercises(workoutId, exercises) {
    const insert = db.prepare(
      `INSERT INTO exercises (workout_id, position, name, sets, reps, weight, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    exercises.forEach((e, i) => insert.run(workoutId, i, e.name, e.sets, e.reps, e.weight, e.notes));
  }

  router.get('/', (req, res) => {
    const { where, params } = buildFilter(req.user.id, req.query);
    const { limit, offset } = parsePaging(req.query);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM workouts w WHERE ${where}`).get(...params);
    const rows = db.prepare(
      `SELECT w.* FROM workouts w WHERE ${where}
        ORDER BY w.date DESC, w.id DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset);
    res.json({ workouts: withExercises(req.user.id, rows), total, limit, offset });
  });

  router.get('/export.csv', (req, res) => {
    const { where, params } = buildFilter(req.user.id, req.query);
    const rows = db.prepare(
      `SELECT w.date, e.name, e.sets, e.reps, e.weight, e.notes
         FROM workouts w JOIN exercises e ON e.workout_id = w.id
        WHERE ${where}
        ORDER BY w.date DESC, w.id DESC, e.position
        LIMIT ?`,
    ).all(...params, MAX_EXPORT_ROWS);

    const lines = ['date,exercise,sets,reps,weight_lb,volume_lb,notes'];
    for (const r of rows) {
      lines.push(
        [r.date, r.name, r.sets, r.reps, r.weight, exerciseVolume(r), r.notes].map(csvCell).join(','),
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fitlog-workouts.csv"');
    res.send(`${lines.join('\r\n')}\r\n`);
  });

  router.post('/', (req, res) => {
    const { value, fields } = validateWorkout(req.body);
    if (fields) throw badRequest('Please fix the highlighted fields.', fields);

    const id = transaction(db, () => {
      const { lastInsertRowid } = db.prepare('INSERT INTO workouts (user_id, date) VALUES (?, ?)')
        .run(req.user.id, value.date);
      insertExercises(lastInsertRowid, value.exercises);
      return lastInsertRowid;
    });
    const [workout] = withExercises(req.user.id, [findOwned(req.user.id, String(id))]);
    res.status(201).json({ workout });
  });

  router.get('/:id', (req, res) => {
    const [workout] = withExercises(req.user.id, [findOwned(req.user.id, req.params.id)]);
    res.json({ workout });
  });

  router.put('/:id', (req, res) => {
    const existing = findOwned(req.user.id, req.params.id);
    const { value, fields } = validateWorkout(req.body);
    if (fields) throw badRequest('Please fix the highlighted fields.', fields);

    transaction(db, () => {
      db.prepare("UPDATE workouts SET date = ?, updated_at = datetime('now') WHERE id = ?")
        .run(value.date, existing.id);
      db.prepare('DELETE FROM exercises WHERE workout_id = ?').run(existing.id);
      insertExercises(existing.id, value.exercises);
    });
    const [workout] = withExercises(req.user.id, [findOwned(req.user.id, req.params.id)]);
    res.json({ workout });
  });

  router.delete('/:id', (req, res) => {
    const existing = findOwned(req.user.id, req.params.id);
    db.prepare('DELETE FROM workouts WHERE id = ?').run(existing.id); // exercises cascade
    res.status(204).end();
  });

  return router;
}
