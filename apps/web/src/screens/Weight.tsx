import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  kgToLb,
  lbToKg,
  zonedDateTimeToUtc,
  type WeightEntry,
} from '@nutripals/core';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Loading, Modal, useToast } from '../components/ui';
import { LineChart } from '../components/charts';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useResource } from '../lib/hooks';
import { prettyDate, prettyDateLong, shiftDay, todayKey, weightText } from '../lib/format';

export default function Weight() {
  const { session, refresh } = useAuth();
  const toast = useToast();
  const units = session?.preferences.unit_system ?? 'metric';
  const timezone = session?.profile.timezone ?? null;
  const today = todayKey(timezone);
  const resource = useResource<{ entries: WeightEntry[] }>(`weight:${session?.user.id ?? ''}`, () => api.weight.list({ limit: 400 }));
  const [weightValue, setWeightValue] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleting, setDeleting] = useState<WeightEntry | null>(null);
  const [enabling, setEnabling] = useState(false);

  const entries = resource.data?.entries ?? [];
  const latest = entries.length > 0 ? entries[entries.length - 1] : null;
  const target = session?.preferences.weight_target_kg ?? null;
  const visible = entries.slice(-60);
  const first = visible[0];
  const change = latest && first && visible.length > 1 ? latest.weight_kg - first.weight_kg : null;

  const chartData = useMemo(
    () =>
      visible.map((entry) => ({
        label: prettyDate(entry.date, { day: 'numeric', month: 'short' }),
        fullLabel: prettyDateLong(entry.date),
        value: Math.round((units === 'imperial' ? kgToLb(entry.weight_kg) : entry.weight_kg) * 10) / 10,
      })),
    [visible, units],
  );

  async function add() {
    setError(null);
    const numeric = Number(weightValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Enter your weight.');
      return;
    }
    setBusy(true);
    try {
      const kg = units === 'imperial' ? lbToKg(numeric) : numeric;
      const loggedAt = date === today ? new Date().toISOString() : zonedDateTimeToUtc(date, '07:30', timezone ?? 'UTC').toISOString();
      const result = await api.weight.add({ weight_kg: Math.round(kg * 100) / 100, logged_at: loggedAt, note: note.trim() || null });
      toast.push(result.awarded_xp > 0 ? `Check-in saved (+${result.awarded_xp} XP).` : 'Check-in saved.', 'success');
      setWeightValue('');
      setNote('');
      resource.reload();
      void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const numeric = Number(editValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Enter a valid weight.');
      return;
    }
    setBusy(true);
    try {
      const kg = units === 'imperial' ? lbToKg(numeric) : numeric;
      await api.weight.update(editing.id, { weight_kg: Math.round(kg * 100) / 100, note: editNote.trim() || null });
      setEditing(null);
      resource.reload();
      void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.weight.remove(deleting.id);
      setDeleting(null);
      resource.reload();
      void refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function enableWeight() {
    setEnabling(true);
    try {
      await api.me.updatePreferences({ show_weight: true });
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setEnabling(false);
    }
  }

  if (!session?.preferences.show_weight) {
    return (
      <div className="stack">
        <h1>Weight is hidden</h1>
        <Card className="card-pad stack">
          <div className="row" style={{ gap: 14 }}>
            <Icon name="lock" size={26} />
            <p className="small muted grow">
              You chose to hide weight tracking. Your stored entries are untouched and you can turn this back on whenever you like.
            </p>
          </div>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <Button variant="secondary" loading={enabling} onClick={() => void enableWeight()}>Show weight tracking</Button>
          <Link to="/app" className="btn btn-ghost">Back to today</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div>
        <h1>Weight</h1>
        <p className="muted small">Optional, private, and only as useful as you find it. Daily fluctuations are normal.</p>
      </div>

      {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

      <div className="dash-grid">
        <div className="dash-main">
          <Card className="card-pad">
            <div className="row-between wrap" style={{ gap: 12 }}>
              <div>
                <p className="eyebrow">Latest recorded</p>
                <strong className="mono" style={{ fontSize: '2.2rem', display: 'block', marginTop: 4 }}>
                  {latest ? weightText(latest.weight_kg, units) : '—'}
                </strong>
                <p className="tiny muted">
                  {latest ? prettyDateLong(latest.date) : 'No entries yet. Entirely optional.'}
                  {target ? ` · target ${weightText(target, units)}` : ''}
                </p>
              </div>
              {change !== null ? (
                <span className={`pill ${change > 0 ? 'pill-amber' : 'pill-blue'}`}>
                  <Icon name={change > 0 ? 'arrowUp' : 'arrowDown'} size={14} /> {Math.abs(change * (units === 'imperial' ? 2.2046226218 : 1)).toFixed(1)} {units === 'imperial' ? 'lb' : 'kg'} across {visible.length} entries
                </span>
              ) : null}
            </div>
            {chartData.length >= 2 ? (
              <div style={{ marginTop: 16 }}>
                <LineChart
                  data={chartData}
                  unit={units === 'imperial' ? 'lb' : 'kg'}
                  ariaLabel="Weight entries over time"
                />
              </div>
            ) : (
              <p className="small muted" style={{ marginTop: 12 }}>Add at least two entries to see a trend.</p>
            )}
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Recorded values only. Weight changes reflect many things, including water and time of day — not a score.
            </p>
          </Card>

          <Card className="list-card" as="section">
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h2>History</h2>
            </div>
            {resource.loading && !resource.data ? <Loading /> : null}
            {entries.length === 0 && !resource.loading ? <EmptyState icon="scale" title="No entries yet" /> : null}
            {[...entries].reverse().map((entry) => (
              <div key={entry.id} className="list-row">
                <div className="grow">
                  <div className="list-title">{weightText(entry.weight_kg, units)}</div>
                  <div className="list-sub">
                    {prettyDateLong(entry.date)}{entry.note ? ` · ${entry.note}` : ''}
                  </div>
                </div>
                <IconButton
                  icon="edit"
                  label="Edit entry"
                  onClick={() => {
                    setEditing(entry);
                    setEditValue(String(units === 'imperial' ? Math.round(kgToLb(entry.weight_kg) * 10) / 10 : entry.weight_kg));
                    setEditNote(entry.note ?? '');
                  }}
                />
                <IconButton icon="trash" label="Delete entry" onClick={() => setDeleting(entry)} />
              </div>
            ))}
          </Card>
        </div>

        <aside className="dash-side">
          <Card className="card-pad stack">
            <h2>Log a check-in</h2>
            <Field label={`Weight (${units === 'imperial' ? 'lb' : 'kg'})`} htmlFor="weight-add">
              <input
                id="weight-add"
                className="input"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weightValue}
                onChange={(event) => setWeightValue(event.target.value)}
                placeholder={units === 'imperial' ? '132.0' : '60.0'}
              />
            </Field>
            <Field label="Date" htmlFor="weight-date">
              <input id="weight-date" className="input" type="date" max={shiftDay(today, 0)} value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Note" htmlFor="weight-note" optional>
              <input id="weight-note" className="input" maxLength={280} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Morning, after breakfast…" />
            </Field>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <Button variant="primary" loading={busy} onClick={() => void add()}>Save check-in</Button>
            <p className="tiny muted">
              We never show a projected future weight. Trends use only what you record.
            </p>
          </Card>
          <Card className="card-pad">
            <h3>Hide weight instead?</h3>
            <p className="small muted" style={{ marginTop: 6 }}>
              Habit tracking works without any weight data. You can hide this section in Settings.
            </p>
            <Link to="/app/settings" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Open settings</Link>
          </Card>
        </aside>
      </div>

      {editing ? (
        <Modal
          title="Edit check-in"
          onClose={() => setEditing(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={() => void saveEdit()}>Save</Button>
            </>
          }
        >
          <div className="stack">
            <Field label={`Weight (${units === 'imperial' ? 'lb' : 'kg'})`} htmlFor="weight-edit">
              <input id="weight-edit" className="input" type="number" step="0.1" value={editValue} onChange={(event) => setEditValue(event.target.value)} />
            </Field>
            <Field label="Note" htmlFor="weight-edit-note" optional>
              <input id="weight-edit-note" className="input" maxLength={280} value={editNote} onChange={(event) => setEditNote(event.target.value)} />
            </Field>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title="Delete this entry?"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>Keep it</Button>
              <Button variant="danger" loading={busy} onClick={() => void remove()}>Delete</Button>
            </>
          }
        >
          <p className="small muted">{weightText(deleting.weight_kg, units)} from {prettyDateLong(deleting.date)}.</p>
        </Modal>
      ) : null}
    </div>
  );
}
