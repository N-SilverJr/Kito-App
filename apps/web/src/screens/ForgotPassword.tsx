import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field } from '../components/ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/hooks';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.auth.forgotPassword(email);
      setSent(true);
      if (response.dev_reset_token) setDevToken(response.dev_reset_token);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Locked out? It happens."
      subtitle="We’ll send a reset link if an account exists for that email. For privacy, the response is the same either way."
      points={[{ icon: 'lock', label: 'Secure reset' }]}
      mood="thinking"
    >
      {sent ? (
        <div className="auth-card stack">
          <h2>Check your email</h2>
          <p className="small muted">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. The link expires in one hour.
          </p>
          {devToken ? (
            <div className="dev-token">
              Development reset link
              <code>
                <Link to={`/reset-password?token=${encodeURIComponent(devToken)}`}>Open reset link</Link>
              </code>
            </div>
          ) : null}
          <Link className="btn btn-primary btn-block" to="/login">Back to sign in</Link>
          <Button variant="ghost" block onClick={() => setSent(false)}>Use a different email</Button>
        </div>
      ) : (
        <form className="auth-card stack" onSubmit={submit} noValidate>
          <h2>Reset your password</h2>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <Field label="Email" htmlFor="forgot-email">
            <input
              id="forgot-email"
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
          <Button type="submit" variant="primary" block loading={busy}>
            Send reset link
          </Button>
          <Link to="/login" className="small center">Back to sign in</Link>
        </form>
      )}
    </AuthLayout>
  );
}
