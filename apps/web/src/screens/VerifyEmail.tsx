import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/hooks';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const next = params.get('next');
  const { session, refresh } = useAuth();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [devToken, setDevToken] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setState('working');
    api.auth
      .verifyEmail(token)
      .then(async () => {
        if (!alive) return;
        setState('done');
        await refresh();
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState('error');
        setMessage(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [token, refresh]);

  async function resend() {
    setResendBusy(true);
    setMessage('');
    try {
      const response = await api.auth.resendVerification();
      if (response.dev_verification_token) setDevToken(response.dev_verification_token);
      else setMessage('If your email still needs verification, a new link has been sent.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <AuthLayout
      title={state === 'done' ? 'Email verified.' : 'One small check.'}
      subtitle="Verifying your email keeps account recovery working. You can still use NutriPals without it, but some features may ask again later."
      points={[{ icon: 'mail', label: 'Account security' }]}
      mood={state === 'done' ? 'celebrating' : 'thinking'}
    >
      <div className="auth-card stack">
        <h2>{state === 'done' ? 'You’re verified' : token ? 'Verifying your link' : 'Verify your email'}</h2>
        {state === 'working' ? (
          <div className="loading-inline" role="status">
            <span className="spinner" aria-hidden="true" /> Checking your link…
          </div>
        ) : null}
        {state === 'done' ? (
          <p className="small muted">Thanks — your account is now marked as verified.</p>
        ) : null}
        {state === 'error' ? <div className="form-error" role="alert">{message}</div> : null}
        {!token && state !== 'done' ? (
          <p className="small muted">
            {session?.user.email_verified
              ? 'This account is already verified.'
              : 'Open the verification link from your email, or request a new one below.'}
          </p>
        ) : null}
        {message && state !== 'error' ? <p className="hint">{message}</p> : null}
        {devToken ? (
          <div className="dev-token">
            Development verification link
            <code>
              <Link to={`/verify-email?token=${encodeURIComponent(devToken)}`}>Open verification link</Link>
            </code>
          </div>
        ) : null}
        <div className="stack-sm">
          <Link
            className="btn btn-primary btn-block"
            to={state === 'done' && next === 'onboarding' ? '/onboarding' : '/app'}
          >
            Continue to NutriPals
          </Link>
          {session && !session.user.email_verified ? (
            <Button variant="ghost" block loading={resendBusy} onClick={() => void resend()}>
              Send a new verification link
            </Button>
          ) : null}
          <Link className="btn btn-ghost btn-block" to="/login">Back to sign in</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
