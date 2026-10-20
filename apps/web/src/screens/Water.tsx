import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  WATER_QUICK_ADDS_ML,
  zonedDateTimeToUtc,
  type HydrationEntry,
} from '@nutripals/core';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Loading, Modal, ProgressRing, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useResource } from '../lib/hooks';
import { percent, prettyDate, shiftDay, timeOfDay, todayKey, volumeText } from '../lib/format';

export default function Water() {
  const { session, refresh } = useAuth();
  const toast = useToast();
  const timezone = session?.profile.timezone ?? null;
  const units = session?.preferences.unit_system ?? 'metric';
  const today = todayKey(timezone);
  const [date, setDate] = useState(today);
  const resource = useResource<{ entries: HydrationEntry[]; total_ml: number }>(
    `hydration:${date}:${session?.user.id ?? ''}`,
    () => api.hydration.list(date),
  );
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<HydrationEntry | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [deleting, setDeleting] = useState<HydrationEntry | null>(null);
  const target = session?.preferences.water_target_ml ?? 2000;
  const total = resource.data?.total_ml ?? 0;
  const isToday = date === today;

  function loggedAt(): string {
    return isToday ? new Date().toISOString() : zonedDateTimeToUtc(date, '12:00', timezone ?? 'UTC').toISOString();
  }

  async function add(amountMl: number) {
    setError(null);
    setBusy(String(amountMl));
    try {
      const result = await api.hydration.add({ amount_ml: amountMl, logged_at: loggedAt() });
      toast.push(
        result.awarded_xp > 0 ? `Goal reached! ${result.awarded_xp} XP for hydration.` : `${amountMl} ml added.`,
        'success',
      );
      resource.reload();
      if (result.awarded_xp > 0) void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const amount = Math.round(Number(editAmount));
    if (!Number.isFinite(amount) || amount < 10 || amount > 5000) {
      setError('Enter an amount between 10 and 5000 ml.');
      return;
    }
    setBusy('edit');
    try {
      await api.hydration.update(editing.id, amount);
      setEditing(null);
      resource.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy('delete');
    try {
      await api.hydration.remove(deleting.id);
      setDeleting(null);
      resource.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack-lg">
      <div className="row-between wrap">
        <div>
          <h1>Hydration</h1>
          <p className="muted small">A guide, not a quota — drink to thirst.</p>
        </div>
        <div className="date-nav" role="group" aria-label="Choose a date">
          <button type="button" aria-label="Previous day" onClick={() => setDate((value) => shiftDay(value, -1))}>
            <Icon name="left" size={18} />
          </button>
          <span>{isToday ? 'Today' : prettyDate(date)}</span>
          <button type="button" aria-label="Next day" disabled={date >= shiftDay(today, 7)} onClick={() => setDate((value) => shiftDay(value, 1))}>
            <Icon name="right" size={18} />
          </button>
        </div>
      </div>

      {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

      <div className="dash-grid">
        <div className="dash-main">
          <Card className="card-pad">
            <div className="row-between wrap" style={{ gap: 18 }}>
              <div>
                <p className="eyebrow">{isToday ? 'Today' : prettyDate(date)}</p>
                <div className="hero-number" style={{ marginTop: 6 }}>
                  <strong>{volumeText(total, units).split(' ')[0]}</strong>
                  <span>{units === 'imperial' ? 'fl oz' : 'ml'} of {volumeText(target, units)}</span>
                </div>
                <p className="muted small" style={{ marginTop: 6 }}>
                  {total >= target
                    ? 'Goal reached. Extra water only if you’re thirsty.'
                    : `${volumeText(Math.max(0, target - total), units)} to your target.`}
                </p>
              </div>
              <ProgressRing
                value={total}
                max={target}
                label="Hydration progress"
                center={`${Math.round(percent(total, target))}%`}
                sub="of target"
                tone="water"
              />
            </div>
            <div className="water-dots" aria-hidden="true">
              {Array.from({ length: Math.min(12, Math.max(4, Math.ceil(target / 250))) }).map((_, index) => {
                const filled = index < Math.round((total / target) * Math.min(12, Math.max(4, Math.ceil(target / 250))));
                return <span key={index} className={`water-dot ${filled ? 'full' : ''}`} />;
              })}
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              {WATER_QUICK_ADDS_ML.map((amount) => (
                <Button key={amount} variant="secondary" loading={busy === String(amount)} onClick={() => void add(amount)}>
                  +{amount} ml
                </Button>
              ))}
            </div>
            <form
              className="row" style={{ marginTop: 14, alignItems: 'flex-end' }}
              onSubmit={(event) => {
                event.preventDefault();
                const amount = Math.round(Number(custom));
                if (!Number.isFinite(amount) || amount < 10 || amount > 5000) {
                  setError('Enter an amount between 10 and 5000 ml.');
                  return;
                }
                void add(amount).then(() => setCustom(''));
              }}
            >
              <div className="grow">
                <Field label="Custom amount (ml)" htmlFor="water-custom">
                  <input
                    id="water-custom"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={5000}
                    step={10}
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    placeholder="350"
                  />
                </Field>
              </div>
              <Button type="submit" variant="primary" loading={busy === custom}>
                Add
              </Button>
            </form>
            {error ? <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div> : null}
          </Card>

          <Card className="list-card" as="section">
            <div className="card-pad" style={{ paddingBottom: 4 }}>
              <div className="row-between">
                <h2>Entries</h2>
                <span className="pill pill-blue">{resource.data?.entries.length ?? 0}</span>
              </div>
            </div>
            {resource.loading && !resource.data ? <Loading /> : null}
            {resource.data && resource.data.entries.length === 0 ? (
              <EmptyState icon="water" title="No water logged">
                Use a quick add above, or log from the dashboard. Water is optional — tracking is here if it helps.
              </EmptyState>
            ) : null}
            {resource.data?.entries.map((entry) => (
              <div key={entry.id} className="list-row">
                <span className="pill pill-blue">{volumeText(entry.amount_ml, units)}</span>
                <span className="grow list-sub">{timeOfDay(entry.logged_at, timezone)}</span>
                <IconButton
                  icon="edit"
                  label="Edit water entry"
                  onClick={() => {
                    setEditing(entry);
                    setEditAmount(String(entry.amount_ml));
                  }}
                />
                <IconButton icon="trash" label="Delete water entry" onClick={() => setDeleting(entry)} />
              </div>
            ))}
          </Card>
        </div>

        <aside className="dash-side">
          <Card className="card-pad stack-sm">
            <h3>Reminder settings</h3>
            <p className="small muted">
              Browser reminders can nudge you during waking hours. They only run while NutriPals is open in a tab.
            </p>
            <Link to="/app/settings" className="btn btn-secondary btn-sm">Manage reminders</Link>
          </Card>
          <Card className="card-pad">
            <h3>About your target</h3>
            <p className="small muted" style={{ marginTop: 6 }}>
              Your {volumeText(target, units)} target is an estimate based on body weight. Climate, activity and health conditions change what you need.
              NutriPals will never encourage drinking beyond thirst.
            </p>
            <Link to="/app/settings" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Change target</Link>
          </Card>
        </aside>
      </div>

      {editing ? (
        <Modal
          title="Edit water entry"
          onClose={() => setEditing(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" loading={busy === 'edit'} onClick={() => void saveEdit()}>Save</Button>
            </>
          }
        >
          <Field label="Amount (ml)" htmlFor="water-edit">
            <input id="water-edit" className="input" type="number" min={10} max={5000} value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
          </Field>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title="Delete this entry?"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>Keep it</Button>
              <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>Delete</Button>
            </>
          }
        >
          <p className="small muted">{volumeText(deleting.amount_ml, units)} logged at {timeOfDay(deleting.logged_at, timezone)}.</p>
        </Modal>
      ) : null}
    </div>
  );
}
