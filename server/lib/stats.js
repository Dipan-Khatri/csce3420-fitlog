import { addDays, weekStart } from './dates.js';

/**
 * Groups workout sessions into Monday-Sunday weeks ending with the week that
 * contains `today`.
 *
 * @param {{date: string, volume: number}[]} sessions one row per saved session
 * @returns {{weekStart: string, weekEnd: string, sessions: number, volume: number}[]}
 *          oldest week first; each session is counted exactly once
 */
export function buildWeeklySummary(sessions, today, weeks = 8) {
  const currentWeek = weekStart(today);
  const buckets = [];
  const byStart = new Map();
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(currentWeek, -7 * i);
    const bucket = { weekStart: start, weekEnd: addDays(start, 6), sessions: 0, volume: 0 };
    byStart.set(start, bucket);
    buckets.push(bucket);
  }
  for (const session of sessions) {
    const bucket = byStart.get(weekStart(session.date));
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.volume += Number(session.volume) || 0;
  }
  return buckets;
}

/**
 * Number of consecutive weeks in which the goal was met. The current week is
 * still in progress, so it extends the streak when met but does not break it.
 */
export function goalStreak(weeks, goal) {
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const met = weeks[i].sessions >= goal;
    if (met) streak += 1;
    else if (i !== weeks.length - 1) break;
  }
  return streak;
}

/** Training volume of one exercise entry: sets x reps x weight (lb). */
export function exerciseVolume({ sets, reps, weight }) {
  return sets * reps * weight;
}
