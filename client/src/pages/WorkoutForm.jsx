import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Field from '../components/Field.jsx';
import { formatNumber, isValidDateString, todayLocal } from '../format.js';

let nextKey = 1;
const blankExercise = () => ({ key: nextKey++, name: '', sets: '', reps: '', weight: '', notes: '' });

const isWholeNumber = (text, min, max) => /^\d+$/.test(text.trim()) && Number(text) >= min && Number(text) <= max;

/** Mirrors the server rules so most mistakes are caught before a request is sent. */
function validate(date, exercises) {
  const fields = {};
  if (!isValidDateString(date)) fields.date = 'Enter a valid date.';
  else if (date > todayLocal()) fields.date = 'Date cannot be in the future.';

  exercises.forEach((e, i) => {
    if (!e.name.trim()) fields[`exercises.${i}.name`] = 'Enter an exercise name.';
    if (!isWholeNumber(e.sets, 1, 100)) fields[`exercises.${i}.sets`] = 'Whole number, 1 to 100.';
    if (!isWholeNumber(e.reps, 1, 1000)) fields[`exercises.${i}.reps`] = 'Whole number, 1 to 1000.';
    const weight = Number(e.weight);
    if (e.weight.trim() === '' || !Number.isFinite(weight) || weight < 0 || weight > 2000) {
      fields[`exercises.${i}.weight`] = '0 to 2000 lb.';
    }
  });
  return fields;
}

/** Create a new session, or edit an existing one when the URL has an id. */
export default function WorkoutForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const formRef = useRef(null);

  const [date, setDate] = useState(todayLocal());
  const [exercises, setExercises] = useState(() => [blankExercise()]);
  const [knownNames, setKnownNames] = useState([]);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api('/stats/exercises')
      .then((data) => { if (!cancelled) setKnownNames(data.exercises.map((e) => e.name)); })
      .catch(() => {}); // suggestions are optional
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!editing) return undefined;
    let cancelled = false;
    api(`/workouts/${id}`)
      .then(({ workout }) => {
        if (cancelled) return;
        setDate(workout.date);
        setExercises(workout.exercises.map((e) => ({
          key: nextKey++,
          name: e.name,
          sets: String(e.sets),
          reps: String(e.reps),
          weight: String(e.weight),
          notes: e.notes,
        })));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.status === 404 ? 'This workout session no longer exists.' : err.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [editing, id]);

  // After a failed submit, move focus to the first field that needs fixing.
  useEffect(() => {
    if (Object.keys(fields).length) formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [fields]);

  const updateExercise = (key, prop) => (event) =>
    setExercises((list) => list.map((e) => (e.key === key ? { ...e, [prop]: event.target.value } : e)));
  const removeExercise = (key) => {
    setExercises((list) => list.filter((e) => e.key !== key));
    setFields({});
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const problems = validate(date, exercises);
    setFields(problems);
    setError('');
    if (Object.keys(problems).length) return;

    const body = {
      date,
      exercises: exercises.map((e) => ({
        name: e.name.trim(),
        sets: Number(e.sets),
        reps: Number(e.reps),
        weight: Number(e.weight),
        notes: e.notes.trim(),
      })),
    };
    setBusy(true);
    try {
      await api(editing ? `/workouts/${id}` : '/workouts', { method: editing ? 'PUT' : 'POST', body });
      navigate('/history', { state: { flash: editing ? 'Workout updated.' : 'Workout saved.' } });
    } catch (err) {
      setFields(err.fields || {});
      setError(err.fields?.exercises || (err.fields ? 'Please fix the highlighted fields.' : err.message));
      setBusy(false);
    }
  }

  if (loading) return <p className="page-loading" role="status">Loading workout…</p>;
  if (loadError) {
    return (
      <section className="empty">
        <h1>Cannot open workout</h1>
        <p>{loadError}</p>
        <Link to="/history" className="btn btn-primary">Back to history</Link>
      </section>
    );
  }

  const totalVolume = exercises.reduce((sum, e) => {
    const volume = Number(e.sets) * Number(e.reps) * Number(e.weight);
    return sum + (Number.isFinite(volume) ? volume : 0);
  }, 0);

  return (
    <>
      <div className="page-head">
        <h1>{editing ? 'Edit workout' : 'Log workout'}</h1>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="workout-form">
        {error && <p className="alert alert-error" role="alert">{error}</p>}

        <div className="card">
          <Field
            label="Workout date"
            type="date"
            className="field-date"
            value={date}
            max={todayLocal()}
            onChange={(e) => setDate(e.target.value)}
            error={fields.date}
          />
        </div>

        <datalist id="exercise-names">
          {knownNames.map((name) => <option key={name} value={name} />)}
        </datalist>

        {exercises.map((exercise, i) => (
          <fieldset key={exercise.key} className="card exercise">
            <legend>Exercise {i + 1}</legend>
            <Field
              label="Exercise name"
              className="exercise-name"
              list="exercise-names"
              maxLength={60}
              placeholder="e.g. Bench Press"
              value={exercise.name}
              onChange={updateExercise(exercise.key, 'name')}
              error={fields[`exercises.${i}.name`]}
            />
            <Field
              label="Sets"
              inputMode="numeric"
              value={exercise.sets}
              onChange={updateExercise(exercise.key, 'sets')}
              error={fields[`exercises.${i}.sets`]}
            />
            <Field
              label="Reps"
              inputMode="numeric"
              value={exercise.reps}
              onChange={updateExercise(exercise.key, 'reps')}
              error={fields[`exercises.${i}.reps`]}
            />
            <Field
              label="Weight (lb)"
              inputMode="decimal"
              value={exercise.weight}
              onChange={updateExercise(exercise.key, 'weight')}
              error={fields[`exercises.${i}.weight`]}
              hint="0 for bodyweight"
            />
            <Field
              label="Notes (optional)"
              className="exercise-notes"
              maxLength={500}
              value={exercise.notes}
              onChange={updateExercise(exercise.key, 'notes')}
              error={fields[`exercises.${i}.notes`]}
            />
            {exercises.length > 1 && (
              <button
                type="button"
                className="btn btn-quiet exercise-remove"
                onClick={() => removeExercise(exercise.key)}
                aria-label={`Remove exercise ${i + 1}`}
              >
                Remove
              </button>
            )}
          </fieldset>
        ))}

        <button
          type="button"
          className="btn btn-add"
          onClick={() => setExercises((list) => [...list, blankExercise()])}
          disabled={exercises.length >= 30}
        >
          + Add another exercise
        </button>

        <div className="form-footer">
          <p className="form-total">
            Session volume <strong>{formatNumber(totalVolume)} lb</strong>
          </p>
          <div className="form-actions">
            <Link to={editing ? '/history' : '/'} className="btn">Cancel</Link>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Save workout'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
