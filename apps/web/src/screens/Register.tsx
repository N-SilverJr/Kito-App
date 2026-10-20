import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field, IconButton } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/hooks';

export default function Register() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Use at least 10 characters for your password.');
      return;
    }
    setBusy(true);
    try {
      const response = await api.auth.register({
        email,
        password,
        display_name: name.trim() || undefined,
      });
      await refresh();
      if (response.dev_verification_token) {
        setDevToken(response.dev_verification_token);
      } else {
        navigate('/onboarding', { replace: true });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (devToken) {
    return (
      <AuthLayout
        title="You’re in. Let’s make this yours."
        subtitle="This development server has no email provider configured, so the verification link is shown here instead."
        points={[{ icon: 'check', label: 'Account created' }]}
        mood="celebrating"
      >
        <div className="auth-card stack">
          <h2>Verify your email</h2>
          <p className="small muted">
            In production this link arrives by email. You can verify now, or continue and do it later from Settings.
          </p>
          <div className="dev-token">
            Development verification token
            <code>{devToken}</code>
          </div>
          <Link className="btn btn-primary btn-block" to={`/verify-email?token=${encodeURIComponent(devToken)}&next=onboarding`}>
            Verify and continue
          </Link>
          <Button variant="ghost" block onClick={() => navigate('/onboarding', { replace: true })}>
            Skip for now
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="A calmer way to keep track."
      subtitle="A few gentle questions, then your own daily picture. Everything is optional and editable later."
      points={[
        { icon: 'lock', label: 'Your data stays yours' },
        { icon: 'leaf', label: 'Built for real meals' },
        { icon: 'heart', label: 'No streaks pressure' },
      ]}
      mood="curious"
    >
      <form className="auth-card stack" onSubmit={submit} noValidate>
        <div>
          <h2>Create your account</h2>
          <p className="muted small" style={{ marginTop: 6 }}>It takes less than a minute.</p>
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <Field label="What should we call you?" htmlFor="register-name" optional>
          <input
            id="register-name"
            className="input"
            autoComplete="nickname"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Aline"
            maxLength={60}
          />
        </Field>
        <Field label="Email" htmlFor="register-email">
          <input
            id="register-email"
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
        <Field label="Password" htmlFor="register-password" hint="At least 10 characters. A short phrase works well.">
          <div className="input-group">
            <input
              id="register-password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Something memorable"
            />
            <IconButton
              icon={showPassword ? 'eyeOff' : 'eye'}
              label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
              style={{ height: 46, width: 46 }}
            />
          </div>
        </Field>
        <label className="check-row">
          <input type="checkbox" required />
          <span>I understand NutriPals gives general wellness estimates and is not medical advice.</span>
        </label>
        <Button type="submit" variant="primary" block loading={busy}>
          Create account
        </Button>
        <p className="hint center">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
