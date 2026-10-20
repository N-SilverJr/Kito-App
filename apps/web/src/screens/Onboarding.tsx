import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ACTIVITY_LABELS,
  DEFAULT_COMPANION_NAME,
  DISCLAIMER,
  calculateGoals,
  guessTimeZone,
  inToCm,
  lbToKg,
  type ActivityLevel,
  type Goal,
  type Sex,
  type UnitSystem,
} from '@nutripals/core';
import { Button, Card, Chip, Field, Segmented, SwitchRow } from '../components/ui';
import { Companion } from '../components/Companion';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/hooks';

const DIETS = ['Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Halal', 'No pork', 'No beef'];
const ALLERGIES = ['Milk', 'Eggs', 'Peanuts', 'Tree nuts', 'Fish', 'Shellfish', 'Soy', 'Gluten', 'Sesame'];
const GOALS: Array<{ value: Goal; title: string; body: string }> = [
  { value: 'maintain', title: 'Maintain weight', body: 'Keep a steady routine and see what you eat.' },
  { value: 'lose', title: 'Lose weight gently', body: 'A modest calorie range — capped for safety.' },
  { value: 'gain', title: 'Gain weight', body: 'A small surplus with a protein estimate.' },
  { value: 'habits', title: 'Build habits only', body: 'No calorie target. Log meals, water and check-ins.' },
];

function timezoneOptions(current: string): string[] {
  const fallback = [
    'Africa/Kigali',
    'Africa/Nairobi',
    'Africa/Kampala',
    'Africa/Dar_es_Salaam',
    'Africa/Lagos',
    'Africa/Johannesburg',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Dubai',
    'Asia/Kolkata',
    'UTC',
  ];
  let all: string[] = fallback;
  try {
    const supported = Intl.supportedValuesOf('timeZone');
    if (supported.length > 10) all = supported;
  } catch {
    // older browsers keep the fallback list
  }
  const set = new Set([current, ...all]);
  return [...set].sort();
}

export default function Onboarding() {
  const { session, setSession } = useAuth();
  const navigate = useNavigate();
  const browserTz = guessTimeZone();
  const existing = session?.profile;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.display_name ?? '');
  const [birthYear, setBirthYear] = useState<number>(existing?.birth_year ?? 1995);
  const [sex, setSex] = useState<Sex>(existing?.sex ?? 'unspecified');
  const [units, setUnits] = useState<UnitSystem>(session?.preferences.unit_system ?? 'metric');
  const [heightValue, setHeightValue] = useState<number>(
    existing?.height_cm ? Math.round(units === 'imperial' ? existing.height_cm / 2.54 : existing.height_cm) : units === 'imperial' ? 65 : 165,
  );
  const [weightValue, setWeightValue] = useState<number>(
    existing?.weight_kg ? Math.round((units === 'imperial' ? existing.weight_kg / 0.45359237 : existing.weight_kg) * 10) / 10 : units === 'imperial' ? 132 : 60,
  );
  const [targetValue, setTargetValue] = useState<number | ''>('');
  const [activity, setActivity] = useState<ActivityLevel>(existing?.activity_level ?? 'light');
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? 'maintain');
  const [timezone, setTimezone] = useState(existing?.timezone ?? browserTz);
  const [calorieTracking, setCalorieTracking] = useState(session?.preferences.calorie_tracking_enabled ?? true);
  const [showWeight, setShowWeight] = useState(session?.preferences.show_weight ?? true);
  const [fasting, setFasting] = useState(session?.preferences.fasting_enabled ?? false);
  const [waterTarget, setWaterTarget] = useState(session?.preferences.water_target_ml ?? 2000);
  const [diets, setDiets] = useState<string[]>(session?.preferences.dietary_preferences ?? []);
  const [allergies, setAllergies] = useState<string[]>(session?.preferences.allergies ?? []);
  const [companionName, setCompanionName] = useState(session?.preferences.companion_name ?? DEFAULT_COMPANION_NAME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const heightCm = units === 'imperial' ? inToCm(heightValue) : heightValue;
  const weightKg = units === 'imperial' ? lbToKg(weightValue) : weightValue;
  const targetKg = targetValue === '' ? null : units === 'imperial' ? lbToKg(Number(targetValue)) : Number(targetValue);

  const preview = useMemo(() => {
    if (!heightCm || !weightKg || !birthYear) return null;
    try {
      return calculateGoals({
        sex,
        birthYear,
        heightCm,
        weightKg,
        activityLevel: activity,
        goal,
      });
    } catch {
      return null;
    }
  }, [heightCm, weightKg, birthYear, sex, activity, goal]);

  function toggle(list: string[], setList: (value: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function validate(): string | null {
    if (step === 0) {
      if (!name.trim()) return 'Add a display name so Kito knows what to call you.';
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear - 13) {
        return 'Enter a birth year that puts you at 13 or older.';
      }
    }
    if (step === 1) {
      if (!heightValue || heightValue < (units === 'imperial' ? 39 : 100) || heightValue > (units === 'imperial' ? 98 : 250)) {
        return 'Enter a height between 100 and 250 cm (or the equivalent).';
      }
      if (!weightValue || weightKg < 25 || weightKg > 350) return 'Enter a weight between 25 and 350 kg (or the equivalent).';
      if (targetKg !== null && (targetKg < 20 || targetKg > 400)) return 'That target weight looks outside the supported range.';
    }
    if (step === 3) {
      if (!companionName.trim()) return 'Give your companion a name (or keep Kito).';
      if (waterTarget < 500 || waterTarget > 6000) return 'Water target should be between 500 and 6000 ml.';
    }
    return null;
  }

  function next() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((value) => Math.min(3, value + 1));
  }

  async function finish() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.me.completeOnboarding({
        display_name: name.trim(),
        birth_year: birthYear,
        height_cm: Math.round(heightCm * 10) / 10,
        weight_kg: Math.round(weightKg * 100) / 100,
        sex,
        activity_level: activity,
        goal,
        unit_system: units,
        timezone,
        calorie_tracking_enabled: calorieTracking,
        show_weight: showWeight,
        fasting_enabled: fasting,
        weight_target_kg: targetKg,
        water_target_ml: waterTarget,
        dietary_preferences: diets,
        allergies,
        companion_name: companionName.trim(),
        time_format: '24h',
      });
      setSession(response);
      navigate('/app', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboard-wrap">
      <div className="row-between">
        <div className="row" style={{ gap: 10 }}>
          <img src="/icon.svg" alt="" width={40} height={40} style={{ borderRadius: 12 }} />
          <strong style={{ fontSize: '1.15rem' }}>NutriPals</strong>
        </div>
        <span className="pill">{step + 1} of 4</span>
      </div>
      <div className="onboard-steps" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={index <= step ? 'done' : ''} />
        ))}
      </div>

      <Card className="card-pad stack">
        {step === 0 ? (
          <>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <div className="grow">
                <h1 style={{ fontSize: '1.6rem' }}>First, the basics</h1>
                <p className="muted small" style={{ marginTop: 6 }}>
                  We use these only to personalise your estimates. Your exact birthday is never needed.
                </p>
              </div>
              <Companion mood="curious" size={110} animate={false} />
            </div>
            <Field label="Display name" htmlFor="onboard-name">
              <input id="onboard-name" className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
            </Field>
            <div className="field-grid two">
              <Field label="Birth year" htmlFor="onboard-birth" hint="Used for age-appropriate safeguards.">
                <input
                  id="onboard-birth"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getFullYear() - 13}
                  value={birthYear}
                  onChange={(event) => setBirthYear(Number(event.target.value))}
                />
              </Field>
              <Field label="Units" htmlFor="onboard-units">
                <Segmented
                  label="Unit system"
                  value={units}
                  onChange={setUnits}
                  options={[
                    { value: 'metric', label: 'Metric (kg, cm)' },
                    { value: 'imperial', label: 'Imperial (lb, in)' },
                  ]}
                />
              </Field>
            </div>
            <Field label="Sex used for energy estimates" htmlFor="onboard-sex" hint="Optional. “Prefer not to say” uses a neutral average and is perfectly fine.">
              <Segmented
                label="Sex used for estimates"
                value={sex}
                onChange={setSex}
                options={[
                  { value: 'female', label: 'Female' },
                  { value: 'male', label: 'Male' },
                  { value: 'unspecified', label: 'Prefer not to say' },
                ]}
              />
            </Field>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 style={{ fontSize: '1.6rem' }}>Your body, your numbers</h1>
            <p className="muted small">You can change any of this later. Nothing here is shared with anyone.</p>
            <div className="field-grid two">
              <Field label={`Height (${units === 'imperial' ? 'in' : 'cm'})`} htmlFor="onboard-height">
                <input
                  id="onboard-height"
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={heightValue}
                  onChange={(event) => setHeightValue(Number(event.target.value))}
                />
              </Field>
              <Field label={`Current weight (${units === 'imperial' ? 'lb' : 'kg'})`} htmlFor="onboard-weight">
                <input
                  id="onboard-weight"
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={weightValue}
                  onChange={(event) => setWeightValue(Number(event.target.value))}
                />
              </Field>
            </div>
            <Field
              label={`Target weight (${units === 'imperial' ? 'lb' : 'kg'})`}
              htmlFor="onboard-target"
              optional
              hint="Optional and private. Progress is shown as recorded data, never as a promise."
            >
              <input
                id="onboard-target"
                className="input"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={targetValue}
                onChange={(event) => setTargetValue(event.target.value === '' ? '' : Number(event.target.value))}
              />
            </Field>
            <div className="field">
              <span className="label">How active is a typical week?</span>
              <div className="choice-grid two">
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="choice"
                    aria-pressed={activity === key}
                    onClick={() => setActivity(key)}
                  >
                    <strong>{ACTIVITY_LABELS[key]}</strong>
                  </button>
                ))}
              </div>
            </div>
            <SwitchRow
              id="onboard-show-weight"
              label="Show weight tracking"
              description="Turn this off to use habit tracking only. You can hide weight completely."
              checked={showWeight}
              onChange={setShowWeight}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 style={{ fontSize: '1.6rem' }}>What matters most?</h1>
            <div className="choice-grid two">
              {GOALS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="choice"
                  aria-pressed={goal === option.value}
                  onClick={() => setGoal(option.value)}
                >
                  <strong>{option.title}</strong>
                  <span>{option.body}</span>
                </button>
              ))}
            </div>
            <SwitchRow
              id="onboard-calories"
              label="Show calorie and macro targets"
              description="Turn this off for a habit-only dashboard. Meals and water still work."
              checked={calorieTracking}
              onChange={setCalorieTracking}
            />
            {preview ? (
              <div className="goal-preview">
                <div className="row-between">
                  <strong>Your starting estimate</strong>
                  <span className="pill pill-amber">Estimate</span>
                </div>
                <div className="goal-preview-grid">
                  <div>
                    <strong>{preview.calories} kcal</strong>
                    <span className="tiny muted">daily energy target</span>
                  </div>
                  <div>
                    <strong>{preview.protein_g} g</strong>
                    <span className="tiny muted">protein</span>
                  </div>
                  <div>
                    <strong>{preview.carbs_g} g</strong>
                    <span className="tiny muted">carbohydrate</span>
                  </div>
                  <div>
                    <strong>{preview.fat_g} g</strong>
                    <span className="tiny muted">fat</span>
                  </div>
                </div>
                <ul className="tiny muted" style={{ margin: '12px 0 0 18px', display: 'grid', gap: 4 }}>
                  {preview.assumptions.slice(0, 3).map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
                {preview.safety.adjusted ? (
                  <div className="analysis-note" style={{ marginTop: 12 }}>
                    {preview.safety.reasons.map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="hint">
              <Icon name="info" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {DISCLAIMER}
            </p>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 style={{ fontSize: '1.6rem' }}>Make it feel like yours</h1>
            <div className="field-grid two">
              <Field label="Water target (ml)" htmlFor="onboard-water" hint="A starting point — adjust for climate and thirst.">
                <input
                  id="onboard-water"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  step="50"
                  min={500}
                  max={6000}
                  value={waterTarget}
                  onChange={(event) => setWaterTarget(Number(event.target.value))}
                />
              </Field>
              <Field label="Companion name" htmlFor="onboard-companion">
                <input
                  id="onboard-companion"
                  className="input"
                  value={companionName}
                  maxLength={24}
                  onChange={(event) => setCompanionName(event.target.value)}
                />
              </Field>
            </div>
            <Field label="Timezone" htmlFor="onboard-tz" hint="Day boundaries and fasting timers follow this timezone.">
              <select id="onboard-tz" className="select" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                {timezoneOptions(browserTz).map((zone) => (
                  <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span className="label">Dietary preferences (optional)</span>
              <div className="chip-row">
                {DIETS.map((diet) => (
                  <Chip key={diet} pressed={diets.includes(diet)} onClick={() => toggle(diets, setDiets, diet)}>
                    {diet}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="label">Allergies and ingredients to avoid</span>
              <p className="hint">We filter meal plans and flag matching foods. Always double-check packaging yourself.</p>
              <div className="chip-row">
                {ALLERGIES.map((allergy) => (
                  <Chip key={allergy} pressed={allergies.includes(allergy)} onClick={() => toggle(allergies, setAllergies, allergy)}>
                    {allergy}
                  </Chip>
                ))}
              </div>
            </div>
            <SwitchRow
              id="onboard-fasting"
              label="Enable fasting timer"
              description="Optional. Fasting is not required for any goal, and is not recommended for under-18s."
              checked={fasting}
              onChange={setFasting}
            />
            <div className="row" style={{ gap: 14, alignItems: 'flex-start', background: 'var(--surface-2)', borderRadius: 16, padding: 14 }}>
              <Companion mood="encouraging" size={90} animate={false} />
              <div>
                <strong>That’s everything.</strong>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  Kito will cheer for consistency — logging, water, check-ins — never for eating less. You can edit all of this in Settings.
                </p>
              </div>
            </div>
          </>
        ) : null}

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="onboard-nav">
          {step > 0 ? (
            <Button
              variant="ghost"
              icon="left"
              onClick={() => {
                setError(null);
                setStep((value) => value - 1);
              }}
            >
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button variant="primary" onClick={next}>
              Continue <Icon name="right" size={18} />
            </Button>
          ) : (
            <Button variant="primary" loading={busy} onClick={() => void finish()}>
              Start using NutriPals
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
