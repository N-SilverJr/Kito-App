import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StatsResponse } from '@nutripals/core';
import { Card, EmptyState, ErrorState, Loading, ProgressBar, Segmented, Skeleton } from '../components/ui';
import { BarChart, LineChart, type ChartDatum } from '../components/charts';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useResource } from '../lib/hooks';
import { kcal, percent, plural, prettyDate, shiftDay, todayKey, volumeText, weightText } from '../lib/format';

type Range = '7d' | '30d' | '90d';

const RANGE_LABEL: Record<Range, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };

function shortLabel(dateKey: string): string {
  return prettyDate(dateKey, { day: 'numeric', month: 'short' }).replace(/\s/g, ' ');
}

export default function Stats() {
  const { session } = useAuth();
  const units = session?.preferences.unit_system ?? 'metric';
  const showWeight = session?.preferences.show_weight ?? true;
  const calorieTracking = session?.preferences.calorie_tracking_enabled ?? true;
  const timezone = session?.profile.timezone ?? null;
  const [range, setRange] = useState<Range>('30d');
  const resource = useResource<StatsResponse>(`stats:${range}:${session?.user.id ?? ''}`, () => api.stats(range));

  const data = resource.data;

  if (resource.loading && !data) return <Loading label="Crunching your logs…" />;
  if (resource.error && !data) {
    return <ErrorState message={resource.error} onRetry={resource.reload} />;
  }
  if (!data) return null;

  const loggedDays = data.days.filter((day) => day.meals > 0);
  const kcalData: ChartDatum[] = data.days.map((day) => ({
    label: shortLabel(day.date),
    fullLabel: prettyDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' }),
    value: day.kcal,
  }));
  const waterData: ChartDatum[] = data.days.map((day) => ({
    label: shortLabel(day.date),
    fullLabel: prettyDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' }),
    value: day.water_ml,
  }));
  const weightData: ChartDatum[] = data.weight_series.map((entry) => ({
    label: shortLabel(entry.date),
    fullLabel: prettyDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' }),
    value: units === 'imperial' ? Math.round(entry.weight_kg * 2.2046226218 * 10) / 10 : entry.weight_kg,
  }));

  const totalMeals = data.days.reduce((sum, day) => sum + day.meals, 0);
  const proteinPerKg =
    session?.profile.weight_kg && data.averages.protein_g > 0
      ? data.averages.protein_g / session.profile.weight_kg
      : null;

  return (
    <div className="stack-lg">
      <div className="row-between wrap">
        <div>
          <h1>Insights</h1>
          <p className="muted small">
            Everything here comes from days you actually logged. {data.start} → {data.end}.
          </p>
        </div>
        <Segmented
          label="Date range"
          value={range}
          onChange={(value) => setRange(value)}
          options={[
            { value: '7d' as Range, label: '7 days' },
            { value: '30d' as Range, label: '30 days' },
            { value: '90d' as Range, label: '90 days' },
          ]}
        />
      </div>

      {data.logging_days === 0 ? (
        <Card className="card-pad">
          <EmptyState icon="chart" title="No logs in this period yet">
            <Link to="/app/log">Log your first meal</Link> and insights will fill in automatically. Nothing here is
            simulated or pre-filled.
          </EmptyState>
        </Card>
      ) : null}

      <div className="stat-grid">
        <Card className="stat-card">
          <span className="stat-label">Days logged</span>
          <strong className="stat-value">
            {data.logging_days}
            <small>/{data.days.length}</small>
          </strong>
          <ProgressBar value={data.logging_days} max={data.days.length} />
        </Card>
        <Card className="stat-card">
          <span className="stat-label">Meals recorded</span>
          <strong className="stat-value">{totalMeals}</strong>
          <span className="tiny muted">
            {data.averages.meals_per_day.toFixed(1)} per logged day
          </span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">Current streak</span>
          <strong className="stat-value">
            {data.current_streak}
            <small> {data.current_streak === 1 ? 'day' : 'days'}</small>
          </strong>
          <span className="tiny muted">Longest: {plural(data.longest_streak, 'day')}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">Hydration goal</span>
          <strong className="stat-value">
            {data.hydration_days_met}
            <small> {data.hydration_days_met === 1 ? 'day' : 'days'}</small>
          </strong>
          <span className="tiny muted">of {data.days.length} in range</span>
        </Card>
      </div>

      {calorieTracking ? (
        <Card className="card-pad stack">
          <div className="row-between wrap">
            <h2>Calories per day</h2>
            <span className="tiny muted">
              Average {kcal(data.averages.kcal)} kcal across {loggedDays.length} logged day
              {loggedDays.length === 1 ? '' : 's'}
            </span>
          </div>
          <BarChart data={kcalData} goal={data.goal_calories} unit="kcal" ariaLabel={`Daily calories for the ${RANGE_LABEL[range]}`} />
          <p className="tiny muted">
            Bars above the goal line aren’t failures — the goal is a reference point, not a rule.
          </p>
        </Card>
      ) : (
        <Card className="card-pad stack-sm">
          <h2>Calorie tracking is off</h2>
          <p className="small muted">
            You’ve chosen habit-only tracking, so calorie charts are hidden. Turn it back on in Settings if you ever want
            it.
          </p>
        </Card>
      )}

      <div className="dash-grid">
        <div className="dash-main stack-lg">
          <Card className="card-pad stack">
            <h2>Macronutrients</h2>
            <p className="small muted">Average grams per logged day, compared with your current targets.</p>
            <div className="macro-bars">
              {[
                { label: 'Protein', value: data.averages.protein_g, target: session?.goals?.protein_g ?? null },
                { label: 'Carbs', value: data.averages.carbs_g, target: session?.goals?.carbs_g ?? null },
                { label: 'Fat', value: data.averages.fat_g, target: session?.goals?.fat_g ?? null },
              ].map((row) => (
                <div key={row.label} className="macro-row">
                  <div className="row-between">
                    <span className="strong">{row.label}</span>
                    <span className="tiny muted">
                      {Math.round(row.value)} g{row.target ? ` of ${Math.round(row.target)} g target` : ''}
                    </span>
                  </div>
                  <ProgressBar value={row.value} max={row.target && row.target > 0 ? row.target : Math.max(row.value, 1)} />
                </div>
              ))}
            </div>
            {proteinPerKg !== null ? (
              <p className="tiny muted">
                That’s roughly {proteinPerKg.toFixed(2)} g of protein per kg of your recorded body weight. Estimates only —
                we don’t claim clinical accuracy.
              </p>
            ) : null}
          </Card>

          <Card className="card-pad stack">
            <h2>Hydration</h2>
            <BarChart
              data={waterData}
              goal={session?.preferences.water_target_ml ?? null}
              unit={units === 'imperial' ? 'fl oz' : 'ml'}
              tone="water"
              ariaLabel={`Daily water intake for the ${RANGE_LABEL[range]}`}
            />
            <p className="tiny muted">
              Average {volumeText(data.averages.water_ml, units)} per day. Fewer than {data.days.length} days had water logs,
              so this is a partial picture.
            </p>
          </Card>

          {showWeight ? (
            <Card className="card-pad stack">
              <div className="row-between wrap">
                <h2>Weight trend</h2>
                {data.weight_change_kg !== null ? (
                  <span className="pill">
                    {data.weight_change_kg >= 0 ? '+' : ''}
                    {weightText(Math.abs(data.weight_change_kg), units).replace('-', '')} over range
                  </span>
                ) : null}
              </div>
              <LineChart
                data={weightData}
                unit={units === 'imperial' ? 'lb' : 'kg'}
                ariaLabel="Recorded weight entries over the selected range"
              />
              <p className="tiny muted">
                Day-to-day weight moves with water, food and time of day. Trends are calculated from the actual entries you
                recorded — we never project a future weight.
              </p>
            </Card>
          ) : (
            <Card className="card-pad">
              <h2>Weight tracking is hidden</h2>
              <p className="small muted" style={{ marginTop: 6 }}>
                You chose to hide weight data. Habit and nutrition insights stay available.
              </p>
            </Card>
          )}
        </div>

        <aside className="dash-side stack-lg">
          <Card className="card-pad stack-sm">
            <h3>What the numbers suggest</h3>
            {data.observations.length === 0 ? (
              <p className="small muted">Not enough data yet for observations. Keep logging and check back.</p>
            ) : (
              <ul className="observation-list">
                {data.observations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="tiny muted">
              These are patterns in your own logs — not medical advice, and not proof that any food caused a change.
            </p>
          </Card>

          <Card className="card-pad stack-sm">
            <h3>Achievements</h3>
            <div className="achievement-list">
              {data.achievements.map((achievement) => (
                <div key={achievement.id} className={`achievement ${achievement.earned ? 'earned' : ''}`}>
                  <span className="achievement-icon" aria-hidden="true">
                    {achievement.icon}
                  </span>
                  <div className="grow">
                    <div className="row-between">
                      <span className="strong small">{achievement.title}</span>
                      <span className="tiny muted">
                        {Math.min(achievement.progress, achievement.target)}/{achievement.target}
                      </span>
                    </div>
                    <div className="tiny muted">{achievement.description}</div>
                    <ProgressBar value={achievement.progress} max={achievement.target} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="card-pad stack-sm">
            <h3>Range summary</h3>
            <div className="mini-stats">
              <div>
                <span className="tiny muted">Fiber goal days</span>
                <strong>{data.fiber_days_met}</strong>
              </div>
              <div>
                <span className="tiny muted">Avg water</span>
                <strong>{volumeText(data.averages.water_ml, units)}</strong>
              </div>
              <div>
                <span className="tiny muted">Logging rate</span>
                <strong>{Math.round(percent(data.logging_days, data.days.length))}%</strong>
              </div>
            </div>
            <p className="tiny muted">
              Range ends {prettyDate(shiftDay(todayKey(timezone), 0), { day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </Card>
        </aside>
      </div>

      {data.days.length === 0 ? <Skeleton lines={2} /> : null}
      <p className="tiny muted row" style={{ gap: 6 }}>
        <Icon name="info" size={14} /> Timezone boundaries use {timezone ?? 'your device timezone'}, so a 11pm snack counts
        on the day you actually ate it.
      </p>
    </div>
  );
}
