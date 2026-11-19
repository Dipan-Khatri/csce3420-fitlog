import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, queryString } from '../api.js';
import { useAuth } from '../auth.jsx';
import { GoalRing, WeeklyBars, WeightChart } from '../components/Charts.jsx';
import { formatDate, formatNumber, formatWeight, plural, todayLocal } from '../format.js';

function goalMessage(done, goal) {
  if (done >= goal) return 'Weekly goal met. Nice work.';
  const left = goal - done;
  return `${plural(left, 'session')} to go this week.`;
}

function ExerciseProgress({ exercises }) {
  const [selected, setSelected] = useState(exercises[0].name);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api(`/stats/progress${queryString({ exercise: selected })}`)
      .then((data) => { if (!cancelled) setProgress(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [selected]);

  const best = progress?.personalBest;
  return (
    <section className="card" aria-labelledby="progress-title">
      <div className="card-head">
        <h2 id="progress-title">Exercise progress</h2>
        <label className="inline-select">
          <span className="sr-only">Exercise</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {exercises.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {progress && progress.points.length > 0 && (
        <>
          <WeightChart points={progress.points} exercise={progress.exercise} />
          <p className="chart-note">
            Heaviest weight (lb) recorded each day.{' '}
            {best && best.weight > 0 && (
              <>Personal best: <strong>{formatWeight(best.weight)}</strong> on {formatDate(best.date)}.</>
            )}
          </p>
        </>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api(`/stats/summary${queryString({ today: todayLocal() })}`),
      api('/stats/exercises'),
      api('/workouts?limit=3'),
    ])
      .then(([summary, exercises, recent]) => {
        if (!cancelled) setData({ summary, exercises: exercises.exercises, recent: recent.workouts });
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="alert alert-error" role="alert">{error}</p>;
  if (!data) return <p className="page-loading" role="status">Loading your dashboard…</p>;

  const { summary, exercises, recent } = data;
  const { thisWeek, goal } = summary;

  if (summary.totalSessions === 0) {
    return (
      <section className="empty">
        <h1>Welcome, {user.name}</h1>
        <p>You have not logged any workouts yet. Record your first session to start tracking progress.</p>
        <Link to="/workouts/new" className="btn btn-primary">Log your first workout</Link>
      </section>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">
            Week of {formatDate(thisWeek.weekStart)} to {formatDate(thisWeek.weekEnd)}
          </p>
        </div>
        <Link to="/workouts/new" className="btn btn-primary">Log workout</Link>
      </div>

      <div className="grid-summary">
        <section className="card goal-card" aria-labelledby="goal-title">
          <GoalRing done={thisWeek.sessions} goal={goal} />
          <div>
            <h2 id="goal-title">Weekly goal</h2>
            <p className="goal-message">{goalMessage(thisWeek.sessions, goal)}</p>
            <Link to="/goals">Change goal</Link>
          </div>
        </section>

        <dl className="stats">
          <div className="card stat">
            <dt>Sessions this week</dt>
            <dd>{thisWeek.sessions}</dd>
          </div>
          <div className="card stat">
            <dt>Volume this week</dt>
            <dd>{formatNumber(thisWeek.volume)} <small>lb</small></dd>
          </div>
          <div className="card stat">
            <dt>Goal streak</dt>
            <dd>{summary.streakWeeks} <small>{summary.streakWeeks === 1 ? 'week' : 'weeks'}</small></dd>
          </div>
          <div className="card stat">
            <dt>All-time sessions</dt>
            <dd>{summary.totalSessions}</dd>
          </div>
        </dl>
      </div>

      <section className="card" aria-labelledby="weeks-title">
        <div className="card-head">
          <h2 id="weeks-title">Sessions per week</h2>
          <span className="muted">Last {summary.weeks.length} weeks</span>
        </div>
        <WeeklyBars weeks={summary.weeks} goal={goal} />
      </section>

      {exercises.length > 0 && <ExerciseProgress exercises={exercises} />}

      <section className="card" aria-labelledby="recent-title">
        <div className="card-head">
          <h2 id="recent-title">Recent sessions</h2>
          <Link to="/history">View all history</Link>
        </div>
        <ul className="recent">
          {recent.map((workout) => (
            <li key={workout.id}>
              <span className="recent-date">{formatDate(workout.date)}</span>
              <span className="recent-names">{workout.exercises.map((e) => e.name).join(', ')}</span>
              <span className="recent-volume">{formatNumber(workout.totalVolume)} lb</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
