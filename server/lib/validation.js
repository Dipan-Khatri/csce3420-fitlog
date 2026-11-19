import { addDays, isValidDate, localToday } from './dates.js';

export const LIMITS = {
  name: 60,
  passwordMin: 8,
  passwordMax: 200,
  email: 254,
  exercisesPerWorkout: 30,
  exerciseName: 60,
  sets: 100,
  reps: 1000,
  weight: 2000,
  notes: 500,
  goalMin: 1,
  goalMax: 14,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Accepts numbers and numeric strings; returns NaN for anything else. */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

/** Each validator returns { value, fields }. `fields` is null when the input is valid. */
function result(value, fields) {
  return Object.keys(fields).length ? { value: null, fields } : { value, fields: null };
}

export function validateRegistration(body) {
  const fields = {};
  const input = isObject(body) ? body : {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (!name) fields.name = 'Enter your name.';
  else if (name.length > LIMITS.name) fields.name = `Name must be ${LIMITS.name} characters or fewer.`;

  if (!email) fields.email = 'Enter your email address.';
  else if (email.length > LIMITS.email || !EMAIL_RE.test(email)) fields.email = 'Enter a valid email address.';

  if (password.length < LIMITS.passwordMin) {
    fields.password = `Password must be at least ${LIMITS.passwordMin} characters.`;
  } else if (password.length > LIMITS.passwordMax) {
    fields.password = `Password must be ${LIMITS.passwordMax} characters or fewer.`;
  }

  return result({ name, email, password }, fields);
}

export function validateLogin(body) {
  const fields = {};
  const input = isObject(body) ? body : {};
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!email) fields.email = 'Enter your email address.';
  if (!password) fields.password = 'Enter your password.';
  else if (password.length > LIMITS.passwordMax) fields.password = 'Password is too long.';
  return result({ email, password }, fields);
}

export function validateGoal(body) {
  const fields = {};
  const target = toNumber(isObject(body) ? body.weeklyTarget : undefined);
  if (!Number.isInteger(target) || target < LIMITS.goalMin || target > LIMITS.goalMax) {
    fields.weeklyTarget = `Weekly goal must be a whole number from ${LIMITS.goalMin} to ${LIMITS.goalMax}.`;
  }
  return result({ weeklyTarget: target }, fields);
}

/**
 * Validates a workout session: a date plus one or more exercises.
 * Field keys use dotted paths, e.g. "exercises.0.reps".
 */
export function validateWorkout(body, today = localToday()) {
  const fields = {};
  const input = isObject(body) ? body : {};

  const date = input.date;
  if (!isValidDate(date)) {
    fields.date = 'Enter a valid date.';
  } else if (date > addDays(today, 1)) {
    // One day of slack covers users in time zones ahead of the server.
    fields.date = 'Date cannot be in the future.';
  } else if (date < '2000-01-01') {
    fields.date = 'Date is too far in the past.';
  }

  const exercises = [];
  if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
    fields.exercises = 'Add at least one exercise.';
  } else if (input.exercises.length > LIMITS.exercisesPerWorkout) {
    fields.exercises = `A session can have at most ${LIMITS.exercisesPerWorkout} exercises.`;
  } else {
    input.exercises.forEach((raw, i) => {
      const item = isObject(raw) ? raw : {};
      const name = typeof item.name === 'string' ? item.name.trim().replace(/\s+/g, ' ') : '';
      const sets = toNumber(item.sets);
      const reps = toNumber(item.reps);
      const weight = toNumber(item.weight);
      const notes = typeof item.notes === 'string' ? item.notes.trim() : '';

      if (!name) fields[`exercises.${i}.name`] = 'Enter an exercise name.';
      else if (name.length > LIMITS.exerciseName) {
        fields[`exercises.${i}.name`] = `Name must be ${LIMITS.exerciseName} characters or fewer.`;
      }
      if (!Number.isInteger(sets) || sets < 1 || sets > LIMITS.sets) {
        fields[`exercises.${i}.sets`] = `Sets must be a whole number from 1 to ${LIMITS.sets}.`;
      }
      if (!Number.isInteger(reps) || reps < 1 || reps > LIMITS.reps) {
        fields[`exercises.${i}.reps`] = `Reps must be a whole number from 1 to ${LIMITS.reps}.`;
      }
      if (!Number.isFinite(weight) || weight < 0 || weight > LIMITS.weight) {
        fields[`exercises.${i}.weight`] = `Weight must be from 0 to ${LIMITS.weight} lb.`;
      }
      if (notes.length > LIMITS.notes) {
        fields[`exercises.${i}.notes`] = `Notes must be ${LIMITS.notes} characters or fewer.`;
      }
      exercises.push({ name, sets, reps, weight: Math.round(weight * 100) / 100, notes });
    });
  }

  return result({ date, exercises }, fields);
}
