import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, queryString } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Field from '../components/Field.jsx';
import { formatDate, formatNumber, formatWeight, plural } from '../format.js';

const PAGE_SIZE = 20;
const NO_FILTERS = { from: '', to: '', exercise: '' };

function SessionCard({ workout, onDelete }) {
  const [open, setOpen] = useState(false);
  const detailsId = `session-${workout.id}`;
  return (
    <li className="card session">
      <div className="session-head">
        <button
          type="button"
          className="session-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="session-date">{formatDate(workout.date)}</span>
          <span className="session-summary">
            {workout.exercises.map((e) => e.name).join(', ')}
          </span>
          <span className="session-meta">
            {plural(workout.exercises.length, 'exercise')} · {formatNumber(workout.totalVolume)} lb
          </span>
          <span className="session-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>
      {open && (
        <div id={detailsId} className="session-details">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Volume</th></tr>
              </thead>
              <tbody>
                {workout.exercises.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.name}
                      {e.isPersonalBest && <span className="badge" title="Your heaviest recorded weight for this exercise">PB</span>}
                      {e.notes && <p className="session-notes">{e.notes}</p>}
                    </td>
                    <td>{e.sets}</td>
                    <td>{e.reps}</td>
                    <td>{formatWeight(e.weight)}</td>
                    <td>{formatNumber(e.volume)} lb</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="session-actions">
            <Link to={`/workouts/${workout.id}/edit`} className="btn">Edit</Link>
            <button type="button" className="btn btn-danger-quiet" onClick={() => onDelete(workout)}>Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function History() {
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [applied, setApplied] = useState(NO_FILTERS);
  const [result, setResult] = useState({ workouts: [], total: 0 });
  const [status, setStatus] = useState('loading'); // loading | ready | more | error
  const [error, setError] = useState('');
  const [filterErrors, setFilterErrors] = useState({});
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const requestId = useRef(0);

  // Show the "saved" message once; clear it from history so a reload does not repeat it.
  useEffect(() => {
    if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  // Apply filters shortly after the user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (applied.from && applied.to && applied.from > applied.to) {
      setFilterErrors({ to: 'End date must be on or after the start date.' });
      return;
    }
    setFilterErrors({});
    const current = ++requestId.current;
    setStatus('loading');
    api(`/workouts${queryString({ ...applied, limit: PAGE_SIZE })}`)
      .then((data) => {
        if (current !== requestId.current) return; // a newer search replaced this one
        setResult({ workouts: data.workouts, total: data.total });
        setStatus('ready');
      })
      .catch((err) => {
        if (current !== requestId.current) return;
        setFilterErrors(err.fields || {});
        setError(err.fields ? '' : err.message);
        setStatus(err.fields ? 'ready' : 'error');
      });
  }, [applied]);

  async function loadMore() {
    const current = requestId.current;
    setStatus('more');
    try {
      const data = await api(
        `/workouts${queryString({ ...applied, limit: PAGE_SIZE, offset: result.workouts.length })}`,
      );
      if (current !== requestId.current) return;
      setResult((r) => {
        const seen = new Set(r.workouts.map((w) => w.id));
        return { workouts: [...r.workouts, ...data.workouts.filter((w) => !seen.has(w.id))], total: data.total };
      });
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await api(`/workouts/${toDelete.id}`, { method: 'DELETE' });
      setResult((r) => ({ workouts: r.workouts.filter((w) => w.id !== toDelete.id), total: r.total - 1 }));
      setFlash('Workout deleted.');
      setToDelete(null);
    } catch (err) {
      if (err.status === 404) {
        // Already gone (for example deleted in another tab): treat as done.
        setResult((r) => ({ workouts: r.workouts.filter((w) => w.id !== toDelete.id), total: r.total - 1 }));
        setToDelete(null);
      } else {
        setDeleteError(err.message);
      }
    } finally {
      setDeleting(false);
    }
  }

  const updateFilter = (key) => (event) => {
    setFlash('');
    setFilters((f) => ({ ...f, [key]: event.target.value }));
  };
  const filtering = Boolean(filters.from || filters.to || filters.exercise);
  const { workouts, total } = result;

  return (
    <>
      <div className="page-head">
        <h1>History</h1>
        <div className="page-head-actions">
          <a className="btn" href={`/api/workouts/export.csv${queryString(applied)}`} download>
            Export CSV
          </a>
          <Link to="/workouts/new" className="btn btn-primary">Log workout</Link>
        </div>
      </div>

      {flash && <p className="alert alert-success" role="status">{flash}</p>}

      <form className="card filters" role="search" aria-label="Filter history" onSubmit={(e) => e.preventDefault()}>
        <Field label="From" type="date" value={filters.from} onChange={updateFilter('from')} error={filterErrors.from} />
        <Field label="To" type="date" value={filters.to} onChange={updateFilter('to')} error={filterErrors.to} />
        <Field
          label="Exercise name"
          type="search"
          className="filters-exercise"
          placeholder="e.g. squat"
          maxLength={60}
          value={filters.exercise}
          onChange={updateFilter('exercise')}
        />
        <button type="button" className="btn btn-quiet" onClick={() => setFilters(NO_FILTERS)} disabled={!filtering}>
          Clear
        </button>
      </form>

      {status === 'error' && <p className="alert alert-error" role="alert">{error}</p>}
      {status === 'loading' && <p className="page-loading" role="status">Loading sessions…</p>}

      {status !== 'loading' && status !== 'error' && (
        <>
          <p className="muted result-count" role="status">
            {total === 0 ? 'No sessions' : `Showing ${workouts.length} of ${plural(total, 'session')}`}
            {filtering && total > 0 ? ' matching your filters' : ''}
          </p>

          {total === 0 && (
            <section className="empty">
              {filtering ? (
                <>
                  <h2>No sessions match these filters</h2>
                  <p>Try a wider date range or a different exercise name.</p>
                  <button type="button" className="btn" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
                </>
              ) : (
                <>
                  <h2>No workouts yet</h2>
                  <p>Sessions you save will appear here, newest first.</p>
                  <Link to="/workouts/new" className="btn btn-primary">Log your first workout</Link>
                </>
              )}
            </section>
          )}

          <ul className="sessions">
            {workouts.map((workout) => (
              <SessionCard key={workout.id} workout={workout} onDelete={(w) => { setDeleteError(''); setToDelete(w); }} />
            ))}
          </ul>

          {workouts.length < total && (
            <button type="button" className="btn btn-block" onClick={loadMore} disabled={status === 'more'}>
              {status === 'more' ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this workout?"
        confirmLabel="Delete workout"
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete && (
          <p>
            The session from <strong>{formatDate(toDelete.date)}</strong> with{' '}
            {plural(toDelete.exercises.length, 'exercise')} will be permanently deleted. This cannot be undone.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
