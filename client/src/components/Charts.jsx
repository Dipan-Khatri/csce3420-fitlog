import { formatDate, formatNumber, formatShortDate, plural } from '../format.js';

/** Circular progress toward the weekly session goal. */
export function GoalRing({ done, goal }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(done / goal, 1);
  const met = done >= goal;
  return (
    <svg
      className={`goal-ring ${met ? 'goal-ring-met' : ''}`}
      viewBox="0 0 128 128"
      role="img"
      aria-label={`${done} of ${plural(goal, 'session')} completed this week`}
    >
      <circle cx="64" cy="64" r={radius} className="goal-ring-track" />
      <circle
        cx="64"
        cy="64"
        r={radius}
        className="goal-ring-value"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        transform="rotate(-90 64 64)"
      />
      <text x="64" y="62" textAnchor="middle" className="goal-ring-number">{done}/{goal}</text>
      <text x="64" y="82" textAnchor="middle" className="goal-ring-label">sessions</text>
    </svg>
  );
}

/** Sessions per week for the last few weeks, with the goal drawn as a dashed line. */
export function WeeklyBars({ weeks, goal }) {
  const top = Math.max(goal, ...weeks.map((w) => w.sessions), 1);
  return (
    <div className="bars">
      <div className="bars-plot">
        <div className="bars-goal" style={{ bottom: `${(goal / top) * 100}%` }}>
          <span>Goal {goal}</span>
        </div>
        {weeks.map((week) => (
          <div
            key={week.weekStart}
            className="bars-col"
            title={`Week of ${formatShortDate(week.weekStart)}: ${plural(week.sessions, 'session')}, ${formatNumber(week.volume)} lb`}
          >
            <span className="bars-count">{week.sessions || ''}</span>
            <div
              className={`bars-bar ${week.sessions >= goal ? 'bars-bar-met' : ''}`}
              style={{ height: `${(week.sessions / top) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="bars-axis" aria-hidden="true">
        {weeks.map((week) => <span key={week.weekStart}>{formatShortDate(week.weekStart)}</span>)}
      </div>
      <table className="sr-only">
        <caption>Sessions per week</caption>
        <thead><tr><th>Week of</th><th>Sessions</th><th>Volume (lb)</th></tr></thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.weekStart}>
              <td>{formatDate(week.weekStart)}</td><td>{week.sessions}</td><td>{formatNumber(week.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const W = 640;
const H = 260;
const PAD = { top: 16, right: 20, bottom: 30, left: 46 };

/** Heaviest recorded weight per day for one exercise. */
export function WeightChart({ points, exercise }) {
  const times = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const weights = points.map((p) => p.weight);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  let minW = Math.min(...weights);
  let maxW = Math.max(...weights);
  if (minW === maxW) {
    minW = Math.max(0, minW - 10);
    maxW += 10;
  } else {
    const margin = (maxW - minW) * 0.15;
    minW = Math.max(0, minW - margin);
    maxW += margin;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t) => PAD.left + (maxT === minT ? plotW / 2 : ((t - minT) / (maxT - minT)) * plotW);
  const y = (w) => PAD.top + (1 - (w - minW) / (maxW - minW)) * plotH;

  const ticks = [0, 1, 2, 3].map((i) => minW + ((maxW - minW) * i) / 3);
  const coords = points.map((p, i) => ({ ...p, cx: x(times[i]), cy: y(p.weight) }));
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' ');
  const best = Math.max(...weights);
  const labelled = points.length === 1 ? [0] : [0, points.length - 1];

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Recorded weight for ${exercise} over time`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="chart-tick">{Math.round(tick)}</text>
          </g>
        ))}
        {labelled.map((i) => (
          <text
            key={i}
            x={coords[i].cx}
            y={H - 8}
            textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
            className="chart-tick"
          >
            {formatShortDate(points[i].date)}
          </text>
        ))}
        {points.length > 1 && <path d={path} className="chart-line" />}
        {coords.map((c) => (
          <circle
            key={c.date}
            cx={c.cx}
            cy={c.cy}
            r={c.weight === best ? 6 : 4.5}
            className={`chart-dot ${c.weight === best ? 'chart-dot-best' : ''}`}
          >
            <title>{`${formatDate(c.date)}: ${formatNumber(c.weight)} lb`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="sr-only">
        {points.map((p) => `${formatDate(p.date)}: ${formatNumber(p.weight)} pounds`).join('; ')}
      </figcaption>
    </figure>
  );
}
