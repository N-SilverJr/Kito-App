import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FASTING_PLANS,
  formatDuration,
  type FastingSession,
} from '@nutripals/core';
import { Button, Card, EmptyState, Field, Loading, Modal, ProgressRing, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useNow, useResource } from '../lib/hooks';
import { notificationSupport, requestNotificationPermission } from '../lib/notifications';
import { prettyDate, timeOfDay } from '../lib/format';

export default function Fasting() {
  const { session, refresh } = useAuth();
  const toast = useToast();
  const timezone = session?.profile.timezone ?? null;
  const now = useNow(1000);
  const resource = useResource<{ active: FastingSession | null; sessions: FastingSession[] }>(
    `fasting:${session?.user.id ?? ''}`,
    () => api.fasting.list(),
  );
  const [plan, setPlan] = useState(FASTING_PLANS[2]?.id ?? '16:8');
  const [customHours, setCustomHours] = useState(16);
  const [customEating, setCustomEating] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [minorAcknowledged, setMinorAcknowledged] = useState(false);
  const notified = useRef<string | null>(null);

  const enabled = session?.preferences.fasting_enabled ?? false;
  const age = session?.profile.birth_year ? new Date().getFullYear() - session.profile.birth_year : null;
  const isMinor = age !== null && age < 18;
  const active = resource.data?.active ?? null;
  const elapsed = active ? Math.max(0, now - new Date(active.started_at).getTime()) : 0;
  const targetMs = (active?.target_minutes ?? 0) * 60_000;
  const progress = active ? Math.min(1, elapsed / targetMs) : 0;
  const goalReached = Boolean(active && elapsed >= targetMs);
  const selectedPlan = FASTING_PLANS.find((entry) => entry.id === plan);
  const targetMinutes = plan === 'custom' ? Math.round(customHours * 60) : selectedPlan?.fastingMinutes ?? 960;

  useEffect(() => {
    if (!active || !goalReached) return;
    if (notified.current === active.id) return;
    notified.current = active.id;
    if (notificationSupport() === 'granted') {
      try {
        new Notification('Fasting window reached', {
          body: 'Your planned window is complete. Break the fast gently whenever you are ready.',
          icon: '/icon-192.png',
        });
      } catch {
        // ignore notification failures
      }
    }
  }, [active, goalReached]);

  async function enableFasting() {
    setEnabling(true);
    setError(null);
    try {
      await api.me.updatePreferences({ fasting_enabled: true });
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setEnabling(false);
    }
  }

  async function start() {
    if (isMinor && !minorAcknowledged) {
      setError('Fasting is not recommended for under-18s. Tick the acknowledgement if you still want to use the timer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.fasting.start(plan, targetMinutes);
      resource.reload();
      void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!active) return;
    setBusy(true);
    try {
      const result = await api.fasting.finish(active.id);
      toast.push(result.awarded_xp > 0 ? `Fast complete (+${result.awarded_xp} XP).` : 'Fast complete.', 'success');
      resource.reload();
      void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!active) return;
    setBusy(true);
    try {
      await api.fasting.cancel(active.id);
      setConfirmCancel(false);
      toast.push('Fast cancelled. No streak was harmed.', 'default');
      resource.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="stack">
        <h1>Fasting</h1>
        <Card className="card-pad stack">
          <div className="row" style={{ gap: 14 }}>
            <Icon name="timer" size={28} />
            <div>
              <h2>Fasting is turned off</h2>
              <p className="small muted">It’s optional. NutriPals works fully without it, and fasting is never required for any goal.</p>
            </div>
          </div>
          <div className="analysis-note">
            Fasting is not suitable for everyone — especially under-18s, people who are pregnant or breastfeeding, and anyone with a history of disordered eating or a relevant medical condition. Talk to a clinician if unsure.
          </div>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <Button variant="secondary" loading={enabling} onClick={() => void enableFasting()}>Enable fasting timer</Button>
          <Link to="/app" className="btn btn-ghost">Back to today</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div>
        <h1>Fasting timer</h1>
        <p className="muted small">Purely a timer. Your window is calculated from the stored start time, even after a reload or device restart.</p>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className="dash-grid">
        <div className="dash-main">
          {active ? (
            <Card className="card-pad">
              <div className="fasting-clock">
                <div className="clock-label">{goalReached ? 'Planned window reached' : 'Fasting for'}</div>
                <div className="clock mono">{formatDuration(elapsed, 'clock')}</div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Started {timeOfDay(active.started_at, timezone)} · {prettyDate(active.started_at.slice(0, 10))} · {active.plan} plan ({Math.round(targetMs / 3_600_000)}h target)
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                  <ProgressRing
                    value={elapsed}
                    max={targetMs}
                    label="Fasting progress"
                    center={`${Math.round(progress * 100)}%`}
                    sub={goalReached ? 'complete' : 'of window'}
                    tone={goalReached ? 'over' : 'primary'}
                  />
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
                  <Button variant="primary" loading={busy} onClick={() => void finish()}>Finish fast</Button>
                  <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel</Button>
                </div>
                <p className="tiny muted" style={{ marginTop: 12 }}>
                  You can end early. Consistency matters more than hitting an exact number.
                </p>
              </div>
            </Card>
          ) : (
            <Card className="card-pad stack">
              <h2>Start a window</h2>
              <p className="small muted">Choose a schedule. You can change it next time.</p>
              <div className="choice-grid two">
                {FASTING_PLANS.map((entry) => (
                  <button key={entry.id} type="button" className="choice" aria-pressed={plan === entry.id} onClick={() => setPlan(entry.id)}>
                    <strong>{entry.label}</strong>
                    <span>{entry.description}</span>
                  </button>
                ))}
              </div>
              {plan === 'custom' ? (
                <div className="field-grid two">
                  <Field label="Fasting hours" htmlFor="fast-hours">
                    <input id="fast-hours" className="input" type="number" min={1} max={24} value={customHours} onChange={(event) => setCustomHours(Number(event.target.value))} />
                  </Field>
                  <Field label="Eating window (hours)" htmlFor="eat-hours">
                    <input id="eat-hours" className="input" type="number" min={0} max={23} value={customEating} onChange={(event) => setCustomEating(Number(event.target.value))} />
                  </Field>
                </div>
              ) : (
                <p className="hint">{plan === '12:12' ? 'A gentle rhythm, often close to a normal overnight break.' : plan === '16:8' ? 'A common time-restricted window — not suitable for everyone.' : 'A moderate window with a later breakfast or earlier dinner.'}</p>
              )}
              {isMinor ? (
                <label className="check-row">
                  <input type="checkbox" checked={minorAcknowledged} onChange={(event) => setMinorAcknowledged(event.target.checked)} />
                  <span className="small">
                    I understand fasting is generally not recommended for people under 18 and I’ll speak to a trusted adult or clinician before restricting eating windows.
                  </span>
                </label>
              ) : null}
              <div className="row wrap">
                <Button variant="primary" loading={busy} disabled={isMinor && !minorAcknowledged} onClick={() => void start()}>
                  Start {Math.round(targetMinutes / 60)}h fast
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const result = await requestNotificationPermission();
                    if (result === 'granted') toast.push('Notifications enabled for this device.', 'success');
                    else toast.push('Notifications were not enabled. The timer still works.', 'default');
                  }}
                >
                  Enable notifications
                </Button>
              </div>
              <p className="tiny muted">
                Reminders fire only while this tab is open. Fasting is never required for weight loss.
              </p>
            </Card>
          )}

          <Card className="list-card" as="section">
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h2>History</h2>
            </div>
            {resource.loading && !resource.data ? <Loading /> : null}
            {resource.data && resource.data.sessions.filter((entry) => entry.status !== 'active').length === 0 ? (
              <EmptyState icon="timer" title="No completed sessions yet" />
            ) : null}
            {resource.data?.sessions
              .filter((entry) => entry.status !== 'active')
              .map((entry) => (
                <div key={entry.id} className="list-row">
                  <div className="grow">
                    <div className="list-title">
                      {entry.plan} · {formatDuration((entry.elapsed_minutes ?? 0) * 60_000)}
                    </div>
                    <div className="list-sub">
                      {prettyDate(entry.started_at.slice(0, 10))} · {entry.status}
                    </div>
                  </div>
                  <span className={`pill ${entry.status === 'completed' ? 'pill-green' : 'pill-amber'}`}>
                    {entry.status === 'completed' ? 'Completed' : 'Cancelled'}
                  </span>
                </div>
              ))}
          </Card>
        </div>

        <aside className="dash-side">
          <Card className="card-pad stack-sm">
            <h3>Before you start</h3>
            <p className="small muted">
              Fasting is a personal choice, not a requirement. Skip it if you’re hungry, unwell, pregnant, breastfeeding, under 18, or have a history of disordered eating.
            </p>
            <p className="tiny muted">Times are shown in {timezone?.replace(/_/g, ' ') ?? 'your local timezone'}.</p>
          </Card>
          <Card className="card-pad">
            <h3>Turn fasting off</h3>
            <p className="small muted" style={{ marginTop: 6 }}>You can disable the feature without affecting meals, water or rewards.</p>
            <Button
              variant="ghost"
              size="sm"
              style={{ marginTop: 8 }}
              onClick={async () => {
                await api.me.updatePreferences({ fasting_enabled: false });
                await refresh();
              }}
            >
              Disable fasting
            </Button>
          </Card>
        </aside>
      </div>

      {confirmCancel ? (
        <Modal
          title="Cancel this fast?"
          onClose={() => setConfirmCancel(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep fasting</Button>
              <Button variant="danger" loading={busy} onClick={() => void cancel()}>Cancel fast</Button>
            </>
          }
        >
          <p className="small muted">The session stays in your history as cancelled. No streak is lost.</p>
        </Modal>
      ) : null}
    </div>
  );
}
