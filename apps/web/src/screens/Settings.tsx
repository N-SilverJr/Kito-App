import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  APP_NAME,
  DISCLAIMER,
  GOAL_LABELS,
  type ActivityEntry,
  type ActivityLevel,
  type Goal,
  type ReminderPreferences,
} from '@nutripals/core';
import { Button, Card, Chip, Field, Modal, Segmented, SwitchRow, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { errorMessage, useResource } from '../lib/hooks';
import { notificationSupport, requestNotificationPermission } from '../lib/notifications';
import { grams, heightInputValue, heightText, kcal, prettyDate, todayKey, volumeInputValue, volumeText, weightInputValue, weightText } from '../lib/format';

const GOAL_OPTIONS: Array<{ value: Goal; label: string }> = (Object.entries(GOAL_LABELS) as Array<[Goal, string]>).map(
  ([value, label]) => ({ value, label }),
);
const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string }> = (
  Object.entries(ACTIVITY_LABELS) as Array<[ActivityLevel, string]>
).map(([value, label]) => ({ value, label }));

const DIET_OPTIONS = ['vegetarian', 'vegan', 'pescatarian', 'halal', 'low-carb', 'high-protein'];
const ALLERGY_OPTIONS = ['peanuts', 'tree nuts', 'dairy', 'gluten', 'soy', 'eggs', 'fish', 'shellfish'];

export default function Settings() {
  const { session, refresh, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const units = session?.preferences.unit_system ?? 'metric';
  const timezone = session?.profile.timezone ?? null;
  const today = todayKey(timezone);
  const activity = useResource<{ entries: ActivityEntry[] }>(
    `activity:${today}:${session?.user.id ?? ''}`,
    () => api.activity.list(today),
  );

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState(session?.profile.display_name ?? '');
  const [birthYear, setBirthYear] = useState(String(session?.profile.birth_year ?? ''));
  const [height, setHeight] = useState(String(heightInputValue(session?.profile.height_cm ?? 170, units)));
  const [weight, setWeight] = useState(String(weightInputValue(session?.profile.weight_kg ?? 70, units)));
  const [goal, setGoal] = useState(session?.profile.goal ?? 'maintain');
  const [activityLevel, setActivityLevel] = useState(session?.profile.activity_level ?? 'light');
  const [waterTarget, setWaterTarget] = useState(String(volumeInputValue(session?.preferences.water_target_ml ?? 2000, units)));
  const [weightTarget, setWeightTarget] = useState(
    session?.preferences.weight_target_kg ? String(weightInputValue(session.preferences.weight_target_kg, units)) : '',
  );
  const [reminders, setReminders] = useState<ReminderPreferences | null>(session?.preferences.reminders ?? null);
  const [activityForm, setActivityForm] = useState({ type: 'walking', minutes: 30, steps: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [exporting, setExporting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' });

  if (!session) return null;
  const profile = session.profile;
  const preferences = session.preferences;
  const accountAge = profile.birth_year ? new Date().getFullYear() - profile.birth_year : null;

  async function save(hint: string, action: () => Promise<void>) {
    setSaving(hint);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(null);
    }
  }

  async function saveProfile() {
    const toCm = (value: number) => (units === 'imperial' ? Math.round(value * 2.54) : Math.round(value * 10) / 10);
    const toKg = (value: number) => (units === 'imperial' ? Math.round(value * 0.45359237 * 10) / 10 : Math.round(value * 10) / 10);
    await save('profile', async () => {
      await api.me.updateProfile({
        display_name: name.trim() || profile.display_name,
        birth_year: birthYear ? Number(birthYear) : null,
        height_cm: toCm(Number(height)),
        weight_kg: toKg(Number(weight)),
        goal,
        activity_level: activityLevel,
      });
      setNotice('Profile saved. Your calorie target was recalculated from the updated numbers.');
    });
  }

  async function savePreferences(patch: Parameters<typeof api.me.updatePreferences>[0], hint: string) {
    await save(hint, async () => {
      await api.me.updatePreferences(patch);
    });
  }

  return (
    <div className="stack-lg">
      <div>
        <h1>Settings</h1>
        <p className="muted small">
          Signed in as {session.user.email}
          {session.user.email_verified ? ' (verified)' : ' — email not verified yet'} · joined{' '}
          {prettyDate(session.user.created_at.slice(0, 10), { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="form-success" role="status">{notice}</div> : null}

      <div className="dash-grid">
        <div className="dash-main stack-lg">
          <Card className="card-pad stack">
            <h2>Profile</h2>
            <div className="field-grid two">
              <Field label="Display name" htmlFor="set-name">
                <input id="set-name" className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Birth year" htmlFor="set-birth" hint="Used only to set safe targets." optional>
                <input
                  id="set-birth"
                  className="input"
                  type="number"
                  min={1900}
                  max={new Date().getFullYear() - 13}
                  value={birthYear}
                  onChange={(event) => setBirthYear(event.target.value)}
                />
              </Field>
              <Field label={`Height (${units === 'imperial' ? 'in' : 'cm'})`} htmlFor="set-height">
                <input id="set-height" className="input" type="number" value={height} onChange={(event) => setHeight(event.target.value)} />
              </Field>
              <Field label={`Weight (${units === 'imperial' ? 'lb' : 'kg'})`} htmlFor="set-weight">
                <input id="set-weight" className="input" type="number" value={weight} onChange={(event) => setWeight(event.target.value)} />
              </Field>
            </div>
            <Field label="Goal" htmlFor="set-goal">
              <Segmented
                label="Goal"
                value={goal}
                onChange={(value) => setGoal(value)}
                options={GOAL_OPTIONS}
              />
            </Field>
            <Field label="Activity level" htmlFor="set-activity">
              <Segmented
                label="Activity level"
                value={activityLevel}
                onChange={(value) => setActivityLevel(value)}
                options={ACTIVITY_OPTIONS}
              />
            </Field>
            <p className="tiny muted">
              Current targets: {session.goals ? `${session.goals.calories} kcal · ${grams(session.goals.protein_g)} protein` : 'not calculated'}{' '}
              — method “{session.goals?.method ?? 'unavailable'}”.
              {accountAge !== null ? ` Targets are age-adjusted for a ${accountAge}-year-old.` : ''}
            </p>
            <div className="row wrap">
              <Button variant="primary" loading={saving === 'profile'} onClick={() => void saveProfile()}>
                Save profile
              </Button>
              <Link to="/onboarding" className="btn btn-ghost">Re-run onboarding wizard</Link>
            </div>
          </Card>

          <Card className="card-pad stack">
            <h2>Units and theme</h2>
            <Field label="Measurement units" htmlFor="set-units" hint="Stored values never change; only the display does.">
              <Segmented
                label="Measurement units"
                value={units}
                onChange={(value) => void savePreferences({ unit_system: value }, 'units')}
                options={[
                  { value: 'metric' as const, label: 'Metric (kg, cm, ml)' },
                  { value: 'imperial' as const, label: 'Imperial (lb, in, fl oz)' },
                ]}
              />
            </Field>
            <Field label="Theme" htmlFor="set-theme">
              <Segmented
                label="Theme"
                value={theme}
                onChange={(value) => {
                  setTheme(value);
                  void savePreferences({ theme: value }, 'theme');
                }}
                options={[
                  { value: 'system' as const, label: 'System' },
                  { value: 'light' as const, label: 'Light' },
                  { value: 'dark' as const, label: 'Dark' },
                ]}
              />
            </Field>
          </Card>

          <Card className="card-pad stack">
            <h2>Tracking preferences</h2>
            <SwitchRow
              id="set-calories"
              label="Calorie and macro tracking"
              description="Turn this off to use NutriPals as a habit tracker only. Charts and targets hide."
              checked={preferences.calorie_tracking_enabled}
              onChange={(checked) => void savePreferences({ calorie_tracking_enabled: checked }, 'calories')}
            />
            <SwitchRow
              id="set-show-weight"
              label="Show weight information"
              description="Hide weight entries, charts and goals everywhere."
              checked={preferences.show_weight}
              onChange={(checked) => void savePreferences({ show_weight: checked }, 'weight')}
            />
            <SwitchRow
              id="set-fasting"
              label="Fasting timer"
              description="Optional. Never required for any goal."
              checked={preferences.fasting_enabled}
              onChange={(checked) => void savePreferences({ fasting_enabled: checked }, 'fasting')}
            />
            <div className="field-grid two">
              <Field label={`Daily water target (${units === 'imperial' ? 'fl oz' : 'ml'})`} htmlFor="set-water">
                <input
                  id="set-water"
                  className="input"
                  type="number"
                  min={units === 'imperial' ? 17 : 500}
                  max={units === 'imperial' ? 200 : 6000}
                  value={waterTarget}
                  onChange={(event) => setWaterTarget(event.target.value)}
                />
              </Field>
              {preferences.show_weight ? (
                <Field label={`Target weight (${units === 'imperial' ? 'lb' : 'kg'})`} htmlFor="set-target" optional>
                  <input
                    id="set-target"
                    className="input"
                    type="number"
                    value={weightTarget}
                    onChange={(event) => setWeightTarget(event.target.value)}
                  />
                </Field>
              ) : null}
            </div>
            <Button
              variant="secondary"
              loading={saving === 'targets'}
              onClick={() =>
                void savePreferences(
                  {
                    water_target_ml: units === 'imperial' ? Math.round(Number(waterTarget) * 29.5735) : Math.round(Number(waterTarget)),
                    weight_target_kg:
                      preferences.show_weight && weightTarget
                        ? units === 'imperial'
                          ? Math.round(Number(weightTarget) * 0.45359237 * 10) / 10
                          : Number(weightTarget)
                        : null,
                  },
                  'targets',
                )
              }
            >
              Save targets
            </Button>
            <p className="tiny muted">
              Current: {volumeText(preferences.water_target_ml, units)}
              {preferences.weight_target_kg ? ` · target ${weightText(preferences.weight_target_kg, units)}` : ''}. One target
              is not right for everyone, so adjust it freely.
            </p>
          </Card>

          <Card className="card-pad stack">
            <h2>Dietary preferences and allergies</h2>
            <p className="small muted">Used to filter meal plans and flag foods. Never used to score you.</p>
            <div className="chip-row">
              {DIET_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  pressed={preferences.dietary_preferences.includes(option)}
                  onClick={() =>
                    void savePreferences(
                      {
                        dietary_preferences: preferences.dietary_preferences.includes(option)
                          ? preferences.dietary_preferences.filter((value) => value !== option)
                          : [...preferences.dietary_preferences, option],
                      },
                      'diet',
                    )
                  }
                >
                  {option}
                </Chip>
              ))}
            </div>
            <div className="chip-row">
              {ALLERGY_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  pressed={preferences.allergies.includes(option)}
                  onClick={() =>
                    void savePreferences(
                      {
                        allergies: preferences.allergies.includes(option)
                          ? preferences.allergies.filter((value) => value !== option)
                          : [...preferences.allergies, option],
                      },
                      'allergies',
                    )
                  }
                >
                  {option}
                </Chip>
              ))}
            </div>
          </Card>

          <Card className="card-pad stack">
            <h2>Reminders</h2>
            <p className="small muted">
              Notification permission: <strong>{notificationSupport()}</strong>. Web reminders only fire while a NutriPals tab
              is open — background push needs a server scheduler.
            </p>
            <div className="row wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const result = await requestNotificationPermission();
                  toast.push(result === 'granted' ? 'Notifications enabled.' : 'Notifications were not enabled.', result === 'granted' ? 'success' : 'default');
                }}
              >
                Enable notifications
              </Button>
            </div>
            {reminders ? (
              <div className="stack-sm">
                <SwitchRow
                  id="rem-meals"
                  label="Meal logging nudge"
                  description="One gentle reminder on the days you choose."
                  checked={reminders.meals.enabled}
                  onChange={(checked) => setReminders({ ...reminders, meals: { ...reminders.meals, enabled: checked } })}
                />
                {reminders.meals.enabled ? (
                  <div className="field-grid two">
                    <Field label="Time" htmlFor="rem-meals-time">
                      <input
                        id="rem-meals-time"
                        className="input"
                        type="time"
                        value={reminders.meals.time}
                        onChange={(event) => setReminders({ ...reminders, meals: { ...reminders.meals, time: event.target.value } })}
                      />
                    </Field>
                    <Field label="Days" htmlFor="rem-meals-days" hint="0 = Sunday … 6 = Saturday">
                      <input
                        id="rem-meals-days"
                        className="input"
                        value={reminders.meals.days.join(',')}
                        onChange={(event) =>
                          setReminders({
                            ...reminders,
                            meals: {
                              ...reminders.meals,
                              days: event.target.value
                                .split(',')
                                .map((value) => Number(value.trim()))
                                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                ) : null}

                <SwitchRow
                  id="rem-water"
                  label="Hydration reminders"
                  description="Repeats through your chosen window."
                  checked={reminders.water.enabled}
                  onChange={(checked) => setReminders({ ...reminders, water: { ...reminders.water, enabled: checked } })}
                />
                {reminders.water.enabled ? (
                  <div className="field-grid two">
                    <Field label="From" htmlFor="rem-water-start">
                      <input
                        id="rem-water-start"
                        className="input"
                        type="time"
                        value={reminders.water.start}
                        onChange={(event) => setReminders({ ...reminders, water: { ...reminders.water, start: event.target.value } })}
                      />
                    </Field>
                    <Field label="Until" htmlFor="rem-water-end">
                      <input
                        id="rem-water-end"
                        className="input"
                        type="time"
                        value={reminders.water.end}
                        onChange={(event) => setReminders({ ...reminders, water: { ...reminders.water, end: event.target.value } })}
                      />
                    </Field>
                    <Field label="Every (minutes)" htmlFor="rem-water-every">
                      <input
                        id="rem-water-every"
                        className="input"
                        type="number"
                        min={30}
                        max={480}
                        step={30}
                        value={reminders.water.every_minutes}
                        onChange={(event) =>
                          setReminders({ ...reminders, water: { ...reminders.water, every_minutes: Number(event.target.value) } })
                        }
                      />
                    </Field>
                  </div>
                ) : null}

                <SwitchRow
                  id="rem-weight"
                  label="Weight check-in reminder"
                  description="Optional. Skip it whenever you like."
                  checked={reminders.weight.enabled}
                  onChange={(checked) => setReminders({ ...reminders, weight: { ...reminders.weight, enabled: checked } })}
                />
                {reminders.weight.enabled ? (
                  <div className="field-grid two">
                    <Field label="Time" htmlFor="rem-weight-time">
                      <input
                        id="rem-weight-time"
                        className="input"
                        type="time"
                        value={reminders.weight.time}
                        onChange={(event) => setReminders({ ...reminders, weight: { ...reminders.weight, time: event.target.value } })}
                      />
                    </Field>
                    <Field label="Days" htmlFor="rem-weight-days" hint="0 = Sunday … 6 = Saturday">
                      <input
                        id="rem-weight-days"
                        className="input"
                        value={reminders.weight.days.join(',')}
                        onChange={(event) =>
                          setReminders({
                            ...reminders,
                            weight: {
                              ...reminders.weight,
                              days: event.target.value
                                .split(',')
                                .map((value) => Number(value.trim()))
                                .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                ) : null}

                <SwitchRow
                  id="rem-quiet"
                  label="Quiet hours"
                  description="Nothing is sent inside this window."
                  checked={reminders.quiet_hours.enabled}
                  onChange={(checked) => setReminders({ ...reminders, quiet_hours: { ...reminders.quiet_hours, enabled: checked } })}
                />
                {reminders.quiet_hours.enabled ? (
                  <div className="field-grid two">
                    <Field label="Quiet from" htmlFor="rem-quiet-start">
                      <input
                        id="rem-quiet-start"
                        className="input"
                        type="time"
                        value={reminders.quiet_hours.start}
                        onChange={(event) => setReminders({ ...reminders, quiet_hours: { ...reminders.quiet_hours, start: event.target.value } })}
                      />
                    </Field>
                    <Field label="Quiet until" htmlFor="rem-quiet-end">
                      <input
                        id="rem-quiet-end"
                        className="input"
                        type="time"
                        value={reminders.quiet_hours.end}
                        onChange={(event) => setReminders({ ...reminders, quiet_hours: { ...reminders.quiet_hours, end: event.target.value } })}
                      />
                    </Field>
                  </div>
                ) : null}

                <Button
                  variant="secondary"
                  loading={saving === 'reminders'}
                  onClick={() =>
                    void save('reminders', async () => {
                      await api.me.updatePreferences({ reminders });
                      setNotice('Reminder schedule saved.');
                    })
                  }
                >
                  Save reminders
                </Button>
                <p className="tiny muted">
                  Reminders are scheduled in {timezone?.replace(/_/g, ' ') ?? 'your device timezone'}.
                </p>
              </div>
            ) : null}
          </Card>

          <Card className="card-pad stack">
            <h2>Activity</h2>
            <p className="small muted">
              Manual entry only for now. There is no Health Connect or Apple Health integration, so nothing is read from your
              device.
            </p>
            <div className="field-grid three">
              <Field label="Activity" htmlFor="act-type">
                <select
                  id="act-type"
                  className="input"
                  value={activityForm.type}
                  onChange={(event) => setActivityForm({ ...activityForm, type: event.target.value })}
                >
                  {ACTIVITY_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Minutes" htmlFor="act-minutes">
                <input
                  id="act-minutes"
                  className="input"
                  type="number"
                  min={1}
                  max={600}
                  value={activityForm.minutes}
                  onChange={(event) => setActivityForm({ ...activityForm, minutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="Steps" htmlFor="act-steps" optional>
                <input
                  id="act-steps"
                  className="input"
                  type="number"
                  min={0}
                  max={200000}
                  value={activityForm.steps}
                  onChange={(event) => setActivityForm({ ...activityForm, steps: event.target.value })}
                />
              </Field>
            </div>
            <Button
              variant="secondary"
              loading={saving === 'activity'}
              onClick={() =>
                void save('activity', async () => {
                  await api.activity.add({
                    type: activityForm.type,
                    minutes: activityForm.minutes,
                    steps: activityForm.steps ? Number(activityForm.steps) : null,
                    logged_at: new Date().toISOString(),
                  });
                  setActivityForm({ ...activityForm, steps: '' });
                  activity.reload();
                })
              }
            >
              Add activity
            </Button>
            {activity.data && activity.data.entries.length > 0 ? (
              <ul className="activity-list">
                {activity.data.entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="grow">
                      {ACTIVITY_TYPES.find((type) => type.id === entry.type)?.label ?? entry.type} · {entry.minutes} min
                    </span>
                    <span className="tiny muted">{entry.kcal_burned ? `≈ ${kcal(entry.kcal_burned)} kcal` : 'estimate unavailable'}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      onClick={async () => {
                        await api.activity.remove(entry.id);
                        activity.reload();
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">No activity logged today.</p>
            )}
            <p className="tiny muted">
              Exercise calories are shown separately and are never added to your food goal or subtracted from your intake.
            </p>
          </Card>

          <Card className="card-pad stack">
            <h2>Privacy and data</h2>
            <p className="small muted">
              Your meals, water, weight and fasting records are stored against your account and are not readable by other
              users. Photos you scan are processed for analysis and are not kept in the app database.
            </p>
            <div className="row wrap">
              <Button
                variant="secondary"
                icon="download"
                loading={exporting}
                onClick={async () => {
                  setExporting(true);
                  setError(null);
                  try {
                    const data = await api.me.exportData();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `nutripals-export-${today}.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                    setNotice('Export downloaded.');
                  } catch (caught) {
                    setError(errorMessage(caught));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                Export my data (JSON)
              </Button>
              <Button variant="ghost" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
            <div className="danger-zone">
              <h3>Delete account</h3>
              <p className="small muted">
                This permanently deletes your profile, meals, water, weight, fasting, rewards and companion data. It cannot be
                undone.
              </p>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete my account
              </Button>
            </div>
          </Card>

          <Card className="card-pad stack">
            <h2>Password</h2>
            <div className="field-grid two">
              <Field label="Current password" htmlFor="pw-current">
                <input
                  id="pw-current"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.current}
                  onChange={(event) => setPasswordForm({ ...passwordForm, current: event.target.value })}
                />
              </Field>
              <Field label="New password" htmlFor="pw-next" hint="At least 8 characters.">
                <input
                  id="pw-next"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.next}
                  onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })}
                />
              </Field>
            </div>
            <Button
              variant="secondary"
              loading={saving === 'password'}
              disabled={!passwordForm.current || passwordForm.next.length < 8}
              onClick={() =>
                void save('password', async () => {
                  await api.auth.changePassword(passwordForm.current, passwordForm.next);
                  setPasswordForm({ current: '', next: '' });
                  setNotice('Password changed.');
                })
              }
            >
              Change password
            </Button>
          </Card>
        </div>

        <aside className="dash-side stack-lg">
          <Card className="card-pad stack-sm">
            <h3>Your targets</h3>
            {session.goals ? (
              <>
                <div className="mini-stats">
                  <div>
                    <span className="tiny muted">Calories</span>
                    <strong>{session.goals.calories}</strong>
                  </div>
                  <div>
                    <span className="tiny muted">Protein</span>
                    <strong>{session.goals.protein_g} g</strong>
                  </div>
                  <div>
                    <span className="tiny muted">Carbs</span>
                    <strong>{session.goals.carbs_g} g</strong>
                  </div>
                  <div>
                    <span className="tiny muted">Fat</span>
                    <strong>{session.goals.fat_g} g</strong>
                  </div>
                </div>
                <ul className="observation-list">
                  {session.goals.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="small muted">Complete onboarding to calculate targets.</p>
            )}
          </Card>

          <Card className="card-pad stack-sm">
            <h3>Kito</h3>
            <Field label="Companion name" htmlFor="set-companion">
              <input
                id="set-companion"
                className="input"
                defaultValue={session.companion.name}
                maxLength={24}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (!value || value === session.companion.name) return;
                  void save('companion', async () => {
                    await api.companion.rename(value);
                  });
                }}
              />
            </Field>
            <p className="tiny muted">
              Level {session.companion.level} · {session.companion.streak}{' '}
              {session.companion.streak === 1 ? 'day' : 'days'} streak
            </p>
            <Link to="/app/companion" className="btn btn-ghost btn-sm">
              <Icon name="heart" size={14} /> Open companion
            </Link>
          </Card>

          <Card className="card-pad stack-sm">
            <h3>About</h3>
            <p className="small muted">
              {APP_NAME} v0.1.0 · web build. Install it from your browser menu to use it like an app.
            </p>
            <p className="tiny muted">{DISCLAIMER}</p>
            <p className="tiny muted">Units: {units === 'metric' ? 'metric' : 'imperial'} · Timezone: {timezone ?? 'device default'}</p>
            <p className="tiny muted">
              Signed-in records are private to your account. Support: support@nutripals.example (replace with your real
              address before launch).
            </p>
          </Card>
        </aside>
      </div>

      {confirmDelete ? (
        <Modal
          title="Delete your account?"
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep my account</Button>
              <Button
                variant="danger"
                loading={saving === 'delete'}
                disabled={!deletePassword || deleteConfirmation !== 'DELETE'}
                onClick={() =>
                  void save('delete', async () => {
                    await api.me.deleteAccount(deletePassword, 'DELETE');
                    await signOut();
                  })
                }
              >
                Permanently delete
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="Password" htmlFor="del-password">
              <input
                id="del-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </Field>
            <Field label='Type DELETE to confirm' htmlFor="del-confirm">
              <input id="del-confirm" className="input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
            </Field>
            <p className="tiny muted">
              This removes your records from the NutriPals database immediately. Local browser data (theme and reminder
              bookkeeping) is cleared when you sign out.
            </p>
          </div>
        </Modal>
      ) : null}

      <p className="tiny muted">
        Height reference: {heightText(profile.height_cm ?? 0, units)} · starting weight{' '}
        {profile.weight_kg ? weightText(profile.weight_kg, units) : 'not set'}
      </p>
    </div>
  );
}
