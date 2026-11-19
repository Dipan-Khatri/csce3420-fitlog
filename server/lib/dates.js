// Workout dates are calendar dates ("YYYY-MM-DD") with no time zone. All
// arithmetic is done in UTC so a date never shifts by a day.

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const toMs = (date) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date, days) {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Monday of the week containing `date` (weeks run Monday to Sunday). */
export function weekStart(date) {
  const dayOfWeek = new Date(toMs(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dayOfWeek + 6) % 7));
}

/** Today's calendar date in the server's local time zone. */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
