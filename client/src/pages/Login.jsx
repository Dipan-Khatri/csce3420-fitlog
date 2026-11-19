import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Field from '../components/Field.jsx';
import { Logo } from '../components/Layout.jsx';

export function AuthPage({ title, subtitle, children, footer }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <Logo />
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
        <p className="auth-footer">{footer}</p>
      </div>
    </main>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const problems = {};
    if (!email.trim()) problems.email = 'Enter your email address.';
    if (!password) problems.password = 'Enter your password.';
    setFields(problems);
    setError('');
    if (Object.keys(problems).length) return;

    setBusy(true);
    try {
      await login(email.trim(), password); // on success the router redirects to the app
    } catch (err) {
      setFields(err.fields || {});
      setError(err.fields ? '' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthPage
      title="Sign in"
      subtitle="Log your workouts and track your weekly goal."
      footer={<>New to FitLog? <Link to="/register">Create an account</Link></>}
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthPage>
  );
}
