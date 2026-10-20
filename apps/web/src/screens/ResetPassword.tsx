import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button, Field } from '../components/ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/hooks';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('This reset link is missing its token. Request a new one.');
      return;
    }
    if (password.length < 10) {
      setError('Use at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={done ? 'All set.' : 'Choose a new password.'}
      subtitle="Resetting your password signs you out everywhere else. Your logged meals and check-ins are untouched."
      points={[{ icon: 'lock', label: 'One-time link' }]}
      mood={done ? 'happy' : 'thinking'}
    >
      {done ? (
        <div className="auth-card stack">
          <h2>Password changed</h2>
          <p className="small muted">You can sign in with your new password now.</p>
          <Link className="btn btn-primary btn-block" to="/login">Sign in</Link>
        </div>
      ) : (
        <form className="auth-card stack" onSubmit={submit} noValidate>
          <h2>New password</h2>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <Field label="New password" htmlFor="reset-password" hint="At least 10 characters.">
            <input
              id="reset-password"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Confirm password" htmlFor="reset-confirm">
            <input
              id="reset-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" block loading={busy}>
            Change password
          </Button>
          <Link to="/login" className="small center">Back to sign in</Link>
        </form>
      )}
    </AuthLayout>
  );
}
