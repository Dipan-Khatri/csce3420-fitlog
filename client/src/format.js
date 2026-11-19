// Workout dates are plain "YYYY-MM-DD" strings. They are parsed as local
// calendar dates so they never shift a day because of time zones.

const pad = (n) => String(n).padStart(2, '0');

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = toLocalDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === value;
}

const longFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const shortFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** "Mon, Nov 16, 2026" */
export const formatDate = (dateString) => longFormat.format(toLocalDate(dateString));
/** "Nov 16" */
export const formatShortDate = (dateString) => shortFormat.format(toLocalDate(dateString));
/** "12,345" */
export const formatNumber = (value) => numberFormat.format(value);
/** "135 lb", or "Bodyweight" for 0 */
export const formatWeight = (weight) => (weight === 0 ? 'Bodyweight' : `${formatNumber(weight)} lb`);

export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
