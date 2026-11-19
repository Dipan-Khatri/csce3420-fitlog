import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/workouts/new', label: 'Log workout' },
  { to: '/history', label: 'History' },
  { to: '/goals', label: 'Goals' },
];

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--accent)" />
        <path d="M6 13h3v6H6zm17 0h3v6h-3zM10 10h3v12h-3zm9 0h3v12h-3zm-6 5h6v2h-6z" fill="var(--accent-ink)" />
      </svg>
      FitLog
    </span>
  );
}

/** App shell: top bar on desktop, with the navigation moving to a bottom tab bar on phones. */
export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await logout().catch(() => {});
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="FitLog dashboard"><Logo /></Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <span className="account-name" title={user.email}>{user.name}</span>
          <button type="button" className="btn btn-quiet" onClick={handleSignOut} disabled={signingOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
