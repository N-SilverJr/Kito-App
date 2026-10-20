import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ui';

const Welcome = lazy(() => import('./screens/Welcome'));
const Login = lazy(() => import('./screens/Login'));
const Register = lazy(() => import('./screens/Register'));
const VerifyEmail = lazy(() => import('./screens/VerifyEmail'));
const ForgotPassword = lazy(() => import('./screens/ForgotPassword'));
const ResetPassword = lazy(() => import('./screens/ResetPassword'));
const Onboarding = lazy(() => import('./screens/Onboarding'));
const Dashboard = lazy(() => import('./screens/Dashboard'));
const LogFood = lazy(() => import('./screens/LogFood'));
const Scan = lazy(() => import('./screens/Scan'));
const MealEdit = lazy(() => import('./screens/MealEdit'));
const Water = lazy(() => import('./screens/Water'));
const Weight = lazy(() => import('./screens/Weight'));
const Fasting = lazy(() => import('./screens/Fasting'));
const Stats = lazy(() => import('./screens/Stats'));
const CompanionScreen = lazy(() => import('./screens/CompanionScreen'));
const Plans = lazy(() => import('./screens/Plans'));
const Settings = lazy(() => import('./screens/Settings'));
const NotFound = lazy(() => import('./screens/NotFound'));

function Splash({ label = 'Getting things ready…' }: { label?: string }) {
  return (
    <div className="auth-layout" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <div className="stack" style={{ alignItems: 'center' }}>
        <img src="/icon.svg" alt="" width={72} height={72} style={{ borderRadius: 20 }} />
        <Loading label={label} />
      </div>
    </div>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'error') return <Splash label="Trying to reach the server…" />;
  if (!session) return <Navigate to="/welcome" replace />;
  if (!session.profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  if (status === 'loading') return <Splash />;
  if (!session) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  if (status === 'loading') return <Splash />;
  if (session) {
    return <Navigate to={session.profile.onboarding_completed ? '/app' : '/onboarding'} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { status, session } = useAuth();
  if (status === 'loading') return <Splash />;
  if (!session) return <Navigate to="/welcome" replace />;
  return <Navigate to={session.profile.onboarding_completed ? '/app' : '/onboarding'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/welcome" element={<PublicOnly><Welcome /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/onboarding" element={<OnboardingGate><Onboarding /></OnboardingGate>} />
          <Route
            path="/app"
            element={
              <RequireSession>
                <AppShell />
              </RequireSession>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="log" element={<LogFood />} />
            <Route path="scan" element={<Scan />} />
            <Route path="meal/:id" element={<MealEdit />} />
            <Route path="water" element={<Water />} />
            <Route path="weight" element={<Weight />} />
            <Route path="fasting" element={<Fasting />} />
            <Route path="stats" element={<Stats />} />
            <Route path="companion" element={<CompanionScreen />} />
            <Route path="plans" element={<Plans />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
