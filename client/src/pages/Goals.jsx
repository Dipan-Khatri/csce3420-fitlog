import { useEffect, useState } from 'react';
import { api, queryString } from '../api.js';
import { GoalRing } from '../components/Charts.jsx';
import { formatShortDate, plural, todayLocal } from '../format.js';

const MIN = 1;
const MAX = 14;

export default function Goals() {
  const [summary, setSummary] = useState(null);
  const [target, setTarget] = useState(3);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/stats/summary${queryString({ today: todayLocal() })}`)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setTarget(data.goal);
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <p className="alert alert-error" role="alert">{loadError}</p>;
  if (!summary) return <p className="page-loading" role="status">Loading your goal…</p>;

  const change = (value) => {
    setTarget(Math.min(MAX, Math.max(MIN, value)));
    setSaved(false);
    setError('');
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/goal', { method: 'PUT', body: { weeklyTarget: target } });
      setSummary((s) => ({ ...s, goal: data.weeklyTarget }));
      setSaved(true);
    } catch (err) {
      setError(err.fields?.weeklyTarget || err.message);
    } finally {
      setBusy(false);
    }
  }

  const done = summary.thisWeek.sessions;
  const goal = summary.goal;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Weekly goal</h1>
          <p className="page-sub">Each saved session counts once, however many exercises it has.</p>
        </div>
      </div>

      <div className="grid-goals">
        <section className="card goal-card" aria-labelledby="this-week-title">
          <GoalRing done={done} goal={goal} />
          <div>
            <h2 id="this-week-title">This week</h2>
            <p className="goal-message">
              {done >= goal
                ? `Goal met with ${plural(done, 'session')}.`
                : `${done} of ${plural(goal, 'session')} completed, ${goal - done} to go.`}
            </p>
          </div>
        </section>

        <form className="card" onSubmit={handleSubmit}>
          <h2 id="target-label">Sessions per week</h2>
          <div className="stepper" role="group" aria-labelledby="target-label">
            <button type="button" className="btn stepper-btn" onClick={() => change(target - 1)} disabled={target <= MIN} aria-label="Decrease goal">−</button>
            <output className="stepper-value" aria-live="polite">{target}</output>
            <button type="button" className="btn stepper-btn" onClick={() => change(target + 1)} disabled={target >= MAX} aria-label="Increase goal">+</button>
          </div>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {saved && <p className="alert alert-success" role="status">Goal saved.</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || target === goal}>
            {busy ? 'Saving…' : 'Save goal'}
          </button>
        </form>
      </div>

      <section className="card" aria-labelledby="weeks-title">
        <h2 id="weeks-title">Recent weeks</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Week</th><th>Sessions</th><th>Result</th></tr>
            </thead>
            <tbody>
              {[...summary.weeks].reverse().map((week, i) => {
                const met = week.sessions >= goal;
                return (
                  <tr key={week.weekStart}>
                    <td>{formatShortDate(week.weekStart)} to {formatShortDate(week.weekEnd)}</td>
                    <td>{week.sessions} / {goal}</td>
                    <td>
                      <span className={`pill ${met ? 'pill-good' : ''}`}>
                        {met ? 'Goal met' : i === 0 ? 'In progress' : 'Missed'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
