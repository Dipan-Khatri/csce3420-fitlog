import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Goals from './pages/Goals.jsx';
import History from './pages/History.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Register from './pages/Register.jsx';
import WorkoutForm from './pages/WorkoutForm.jsx';

function Loading() {
  return <p className="page-loading" role="status">Loading…</p>;
}

/** Pages that show personal records: signed-out visitors are sent to the sign-in page. */
function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <Loading />;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

/** Sign-in and register pages: signed-in users go straight to the app. */
function GuestOnly() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <Loading />;
  if (user) return <Navigate to={location.state?.from || '/'} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workouts/new" element={<WorkoutForm />} />
        <Route path="/workouts/:id/edit" element={<WorkoutForm />} />
        <Route path="/history" element={<History />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
