import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Field from '../components/Field.jsx';
import { AuthPage } from './Login.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const problems = {};
    if (!form.name.trim()) problems.name = 'Enter your name.';
    if (!form.email.trim()) problems.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(form.email.trim())) problems.email = 'Enter a valid email address.';
    if (form.password.length < 8) problems.password = 'Password must be at least 8 characters.';
    if (form.confirm !== form.password) problems.confirm = 'Passwords do not match.';
    setFields(problems);
    setError('');
    if (Object.keys(problems).length) return;

    setBusy(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
    } catch (err) {
      setFields(err.fields || {});
      setError(err.fields ? '' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Create your account"
      subtitle="Your workouts are private to your account."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <Field label="Name" autoComplete="name" maxLength={60} value={form.name} onChange={update('name')} error={fields.name} autoFocus />
        <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={update('email')} error={fields.email} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          error={fields.password}
          hint="At least 8 characters."
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          error={fields.confirm}
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthPage>
  );
}
