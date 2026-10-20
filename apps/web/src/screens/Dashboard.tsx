import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DISCLAIMER,
  MEAL_TYPES,
  WATER_QUICK_ADDS_ML,
  formatDuration,
  remainingCalories,
  zonedDateTimeToUtc,
  type DailySummary,
  type MealType,
} from '@nutripals/core';
import { Card, Button, ErrorState, ProgressRing, ProgressBar, Skeleton, useToast } from '../components/ui';
import { Companion } from '../components/Companion';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNow, useResource } from '../lib/hooks';
import { greeting, kcal, mealLabel, percent, prettyDate, shiftDay, timeOfDay, todayKey, volumeText, weightText } from '../lib/format';

const MEAL_ICONS: Record<MealType, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };

export default function Dashboard() {
  const { session } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const now = useNow(30_000);
  const timezone = session?.profile.timezone ?? null;
  const today = todayKey(timezone);
  const requestedDate = params.get('date');
  const [date, setDate] = useState(requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today);
  const [adding, setAdding] = useState<number | null>(null);
  const dashboard = useResource<DailySummary>(`dashboard:${date}:${session?.user.id ?? 'anon'}`, () => api.dashboard(date));

  const data = dashboard.data;
  const units = session?.preferences.unit_system ?? 'metric';
  const profile = session?.profile;
  const preferences = session?.preferences;
  const calorieMode = preferences?.calorie_tracking_enabled !== false;
  const goals = data?.goals ?? session?.goals ?? null;

  const fastingElapsed = useMemo(() => {
    if (!data?.fasting.active) return null;
    return Math.max(0, now - new Date(data.fasting.active.started_at).getTime());
  }, [data?.fasting.active, now]);

  const waterPercent = data ? percent(data.hydration.total_ml, data.hydration.target_ml) : 0;
  const caloriePercent = data && goals ? percent(data.consumed.kcal, goals.calories) : 0;
  const over = Boolean(data && goals && data.consumed.kcal > goals.calories);

  async function addWater(amount: number) {
    if (!data) return;
    setAdding(amount);
    try {
      const loggedAt = date === today ? new Date().toISOString() : zonedDateTimeToUtc(date, '12:00', timezone ?? 'UTC').toISOString();
      const result = await api.hydration.add({ amount_ml: amount, logged_at: loggedAt });
      toast.push(
        result.awarded_xp > 0
          ? `Water logged. ${session?.companion.name ?? 'Kito'} added ${result.awarded_xp} XP for reaching your goal.`
          : 'Water logged.',
        'success',
      );
      dashboard.reload();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Could not add water. Try again.', 'error');
    } finally {
      setAdding(null);
    }
  }

  if (dashboard.loading && !data) {
    return (
      <div className="stack">
        <Skeleton lines={2} />
        <div className="skeleton block" />
        <div className="skeleton block" />
      </div>
    );
  }
  if (dashboard.error && !data) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
  if (!data) return null;

  const isToday = date === today;
  const nextAllowed = date < shiftDay(today, 7);
  const hasAnything = data.meals.length > 0 || data.hydration.total_ml > 0;
  const nextAction = !data.meals.length
    ? { title: 'Log your first meal', body: 'Search a food or describe what you ate.', to: '/app/log', icon: 'plate' as const }
    : data.hydration.total_ml < data.hydration.target_ml * 0.5
      ? { title: 'A glass of water?', body: 'Hydration is half of today’s target.', to: '/app/water', icon: 'water' as const }
      : !data.weight.latest
        ? { title: 'Optional weigh-in', body: 'Only if the trend is useful to you.', to: '/app/weight', icon: 'scale' as const }
        : { title: 'See your patterns', body: 'Weekly averages and streaks.', to: '/app/stats', icon: 'chart' as const };

  return (
    <div className="stack-lg">
      <div className="row-between wrap" style={{ gap: 14 }}>
        <div>
          <p className="eyebrow">{prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 style={{ fontSize: 'clamp(1.5rem, 4.5vw, 2rem)' }}>
            {greeting(timezone)}, {profile?.display_name ?? 'friend'}
          </h1>
        </div>
        <div className="date-nav" role="group" aria-label="Choose a date">
          <button type="button" aria-label="Previous day" onClick={() => setDate((value) => shiftDay(value, -1))}>
            <Icon name="left" size={18} />
          </button>
          <span aria-live="polite">{isToday ? 'Today' : prettyDate(date)}</span>
          <button type="button" aria-label="Next day" disabled={!nextAllowed} onClick={() => setDate((value) => shiftDay(value, 1))}>
            <Icon name="right" size={18} />
          </button>
        </div>
      </div>

      {dashboard.error ? <ErrorState message={dashboard.error} onRetry={dashboard.reload} /> : null}
      {!session?.user.email_verified ? (
        <div className="card card-pad row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <Icon name="mail" />
          <div className="grow">
            <strong className="small">Verify your email</strong>
            <p className="tiny muted">It keeps account recovery working. You can do it from Settings at any time.</p>
          </div>
          <Link to="/app/settings" className="btn btn-sm btn-ghost">Open</Link>
        </div>
      ) : null}

      <div className="dash-grid">
        <div className="dash-main">
          {!hasAnything ? (
            <Card className="card-pad" as="section">
              <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                <Companion mood="curious" size={120} animate={false} />
                <div className="grow">
                  <h2>Fresh page</h2>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    Nothing logged for {isToday ? 'today' : prettyDate(date)} yet. Start with whatever you remember — a meal, a glass of water, or nothing at all.
                  </p>
                  <div className="row wrap" style={{ marginTop: 12 }}>
                    <Link to={`/app/log?date=${date}`} className="btn btn-primary btn-sm">Log a meal</Link>
                    <Link to="/app/scan" className="btn btn-sm">Scan a photo</Link>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="hero" as="section">
            <div className="hero-inner">
              <div className="grow">
                <p className="eyebrow">{calorieMode ? 'Energy today' : 'Habits today'}</p>
                {calorieMode && goals ? (
                  <>
                    <div className="hero-number">
                      <strong>{kcal(over ? data.consumed.kcal - goals.calories : remainingCalories(data.consumed.kcal, goals.calories))}</strong>
                      <span>{over ? 'kcal over target' : 'kcal left'}</span>
                    </div>
                    <p className="hero-label">
                      {kcal(data.consumed.kcal)} eaten of a {kcal(goals.calories)} kcal estimate
                    </p>
                    <div className="macro-grid">
                      <Macro label="Protein" value={data.consumed.protein} target={goals.protein_g} tone="protein" />
                      <Macro label="Carbs" value={data.consumed.carbs} target={goals.carbs_g} tone="carbs" />
                      <Macro label="Fat" value={data.consumed.fat} target={goals.fat_g} tone="fat" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="hero-number">
                      <strong>{data.meals.length}</strong>
                      <span>meal{data.meals.length === 1 ? '' : 's'} logged</span>
                    </div>
                    <p className="hero-label">Habit mode is on — no calorie target, no pressure.</p>
                    <div className="macro-grid">
                      <div className="stat-tile">
                        <strong>{waterPercent.toFixed(0)}%</strong>
                        <span>hydration</span>
                      </div>
                      <div className="stat-tile">
                        <strong>{data.streak}</strong>
                        <span>day streak</span>
                      </div>
                      <div className="stat-tile">
                        <strong>{data.companion.level}</strong>
                        <span>{data.companion.name} level</span>
                      </div>
                    </div>
                  </>
                )}
                <div className="hero-meta">
                  {data.goals ? <span className="pill pill-amber">Goal estimate</span> : null}
                  <Link to="/app/settings" className="pill">Adjust goals</Link>
                  {data.activity.kcal_burned > 0 ? (
                    <span className="pill pill-blue">{data.activity.kcal_burned} kcal activity (not added)</span>
                  ) : null}
                </div>
              </div>
              {calorieMode && goals ? (
                <ProgressRing
                  value={data.consumed.kcal}
                  max={goals.calories}
                  label="Calories consumed against target"
                  center={`${Math.round(caloriePercent)}%`}
                  sub="of target"
                  tone={over ? 'over' : 'primary'}
                />
              ) : (
                <ProgressRing
                  value={data.hydration.total_ml}
                  max={data.hydration.target_ml}
                  label="Hydration"
                  center={`${Math.round(waterPercent)}%`}
                  sub="water"
                  tone="water"
                />
              )}
            </div>
          </Card>

          {data.fasting.active ? (
            <Link to="/app/fasting" className="fasting-banner" style={{ textDecoration: 'none' }}>
              <Icon name="timer" size={22} />
              <div className="grow">
                <strong>{fastingElapsed !== null ? formatDuration(fastingElapsed, 'clock') : '—'}</strong>
                <div className="tiny">Fasting in progress · {data.fasting.active.plan} plan</div>
              </div>
              <Icon name="chevron" size={18} />
            </Link>
          ) : null}

          <Card className="list-card" as="section">
            {MEAL_TYPES.map((type) => {
              const meals = data.meals.filter((meal) => meal.meal_type === type);
              const totals = data.meal_totals_by_type[type];
              const typeKcal = totals?.kcal ?? 0;
              return (
                <div key={type} className="meal-section">
                  <div className="meal-head">
                    <span aria-hidden="true">{MEAL_ICONS[type]}</span>
                    <h3>{mealLabel(type)}</h3>
                    {typeKcal > 0 ? <span className="pill">{kcal(typeKcal)} kcal</span> : null}
                    <Link
                      to={`/app/log?meal=${type}&date=${date}`}
                      className="meal-add"
                      aria-label={`Add food to ${mealLabel(type)}`}
                    >
                      <Icon name="plus" size={16} />
                    </Link>
                  </div>
                  {meals.length === 0 ? (
                    <p className="meal-empty">Nothing here yet.</p>
                  ) : (
                    meals.map((meal) => (
                      <div key={meal.id}>
                        {meal.title ? (
                          <div className="tiny muted" style={{ paddingTop: 4 }}>{meal.title}</div>
                        ) : null}
                        {meal.items.map((item) => (
                          <Link
                            key={item.id}
                            to={`/app/meal/${meal.id}`}
                            className="meal-item"
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            <span className="grow">
                              <span className="list-title">{item.name}</span>
                              <span className="list-sub"> · {Math.round(item.grams)} g · {timeOfDay(meal.eaten_at, timezone)}</span>
                            </span>
                            <span className="mono strong small">{kcal(item.kcal)}</span>
                          </Link>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </Card>

          <div className="quick-grid">
            <Link to={`/app/log?date=${date}`} className="quick-action"><Icon name="plus" /> Log food</Link>
            <Link to="/app/water" className="quick-action"><Icon name="water" /> Water</Link>
            <Link to="/app/weight" className="quick-action"><Icon name="scale" /> Weight</Link>
            <Link to="/app/fasting" className="quick-action"><Icon name="timer" /> Fasting</Link>
          </div>
        </div>

        <aside className="dash-side">
          <Card className="card-pad">
            <div className="companion-card">
              <Companion mood={data.companion.mood} size={96} accessories={data.companion.equipped} className="kito-mini" />
              <div className="grow">
                <div className="row-between">
                  <strong>{data.companion.name}</strong>
                  <span className="pill pill-green">Lv {data.companion.level}</span>
                </div>
                <p className="small muted" style={{ marginTop: 2 }}>{data.companion.message}</p>
              </div>
            </div>
            <div className="level-bar" style={{ marginTop: 14 }}>
              <span>{data.companion.xp_into_level}/{data.companion.xp_for_next_level ?? data.companion.xp_into_level}</span>
              <div className="progress"><span style={{ width: `${data.companion.level_progress * 100}%` }} /></div>
              <span>{data.streak}🔥</span>
            </div>
            <Link to="/app/companion" className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 12 }}>
              Visit {data.companion.name}
            </Link>
          </Card>

          <Card className="card-pad">
            <div className="row-between">
              <h3>Hydration</h3>
              <Link to="/app/water" className="small">Details</Link>
            </div>
            <div className="row-between" style={{ marginTop: 8 }}>
              <strong className="mono" style={{ fontSize: '1.5rem' }}>{volumeText(data.hydration.total_ml, units)}</strong>
              <span className="tiny muted">of {volumeText(data.hydration.target_ml, units)}</span>
            </div>
            <div className="progress water" style={{ marginTop: 8 }}>
              <span style={{ width: `${waterPercent}%` }} />
            </div>
            <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
              {WATER_QUICK_ADDS_ML.slice(0, 4).map((amount) => (
                <Button
                  key={amount}
                  size="sm"
                  variant="secondary"
                  loading={adding === amount}
                  onClick={() => void addWater(amount)}
                >
                  +{amount} ml
                </Button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>Drink to thirst — targets are guides, not quotas.</p>
          </Card>

          {preferences?.show_weight ? (
            <Card className="card-pad">
              <div className="row-between">
                <h3>Weight</h3>
                <Link to="/app/weight" className="small">History</Link>
              </div>
              {data.weight.latest ? (
                <>
                  <strong className="mono" style={{ fontSize: '1.6rem', display: 'block', marginTop: 6 }}>
                    {weightText(data.weight.latest.weight_kg, units)}
                  </strong>
                  <p className="tiny muted">
                    Recorded {prettyDate(data.weight.latest.date)}
                    {data.weight.target_kg ? ` · target ${weightText(data.weight.target_kg, units)}` : ''}
                  </p>
                </>
              ) : (
                <p className="small muted" style={{ marginTop: 6 }}>No weigh-ins yet. Entirely optional.</p>
              )}
              <Link to="/app/weight" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 10 }}>Log a check-in</Link>
            </Card>
          ) : null}

          <Card className="card-pad">
            <p className="eyebrow">Next useful action</p>
            <h3 style={{ marginTop: 6 }}>{nextAction.title}</h3>
            <p className="small muted" style={{ marginTop: 4 }}>{nextAction.body}</p>
            <Link to={nextAction.to} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
              <Icon name={nextAction.icon} /> Open
            </Link>
          </Card>
        </aside>
      </div>

      <p className="legal center" style={{ maxWidth: 680, margin: '0 auto' }}>{DISCLAIMER}</p>
    </div>
  );
}

function Macro({
  label,
  value,
  target,
  tone,
}: {
  label: string;
  value: number;
  target: number;
  tone: 'protein' | 'carbs' | 'fat';
}) {
  return (
    <div className={`macro ${tone}`}>
      <div className="macro-head">
        <span>{label}</span>
        <strong>{Math.round(value)}<span className="muted" style={{ fontWeight: 600 }}> / {Math.round(target)} g</span></strong>
      </div>
      <ProgressBar value={value} max={target} />
    </div>
  );
}
