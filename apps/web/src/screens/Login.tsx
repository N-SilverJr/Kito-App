import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field, IconButton } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/hooks';

export default function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.login({ email, password });
      const session = await refresh();
      if (session && !session.profile.onboarding_completed) navigate('/onboarding', { replace: true });
      else navigate('/app', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Your meals, water and check-ins are waiting exactly where you left them."
      points={[
        { icon: 'lock', label: 'Private by default' },
        { icon: 'calendar', label: 'Your history, kept' },
      ]}
    >
      <form className="auth-card stack" onSubmit={submit} noValidate>
        <div>
          <h2>Sign in</h2>
          <p className="muted small" style={{ marginTop: 6 }}>Use the email you registered with.</p>
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <Field label="Email" htmlFor="login-email">
          <input
            id="login-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <div className="input-group">
            <input
              id="login-password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
            <IconButton
              icon={showPassword ? 'eyeOff' : 'eye'}
              label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
              style={{ height: 46, width: 46 }}
            />
          </div>
        </Field>
        <div className="row-between">
          <Link to="/forgot-password" className="small">Forgot password?</Link>
          <Link to="/register" className="small">Create an account</Link>
        </div>
        <Button type="submit" variant="primary" block loading={busy}>
          Sign in
        </Button>
        <p className="hint center">
          NutriPals offers general wellness estimates, not medical advice.
        </p>
      </form>
    </AuthLayout>
  );
}
