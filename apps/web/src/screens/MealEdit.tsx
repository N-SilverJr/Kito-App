import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  MEAL_TYPES,
  roundNutrition,
  scaleNutrition,
  zonedDateTimeToUtc,
  type Meal,
  type MealType,
  type NutritionFacts,
} from '@nutripals/core';
import { Button, Card, ErrorState, Field, IconButton, Loading, Modal, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useResource } from '../lib/hooks';
import { mealLabel, prettyDateLong, timeOfDay } from '../lib/format';

interface EditRow {
  id: string;
  food_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  gramsInput: string;
  per100g: NutritionFacts | null;
  nutrition: NutritionFacts;
  source: Meal['items'][number]['source'];
  confidence: number | null;
  portion_uncertainty: Meal['items'][number]['portion_uncertainty'];
  ingredients: string[];
}

function toRow(item: Meal['items'][number]): EditRow {
  const nutrition: NutritionFacts = {
    kcal: item.kcal,
    protein: item.protein_g,
    carbs: item.carbs_g,
    fat: item.fat_g,
    fiber: item.fiber_g ?? undefined,
  };
  return {
    id: item.id,
    food_id: item.food_id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    gramsInput: String(Math.round(item.grams)),
    per100g: item.grams > 0 ? scaleNutrition(nutrition, 100 / item.grams) : null,
    nutrition,
    source: item.source,
    confidence: item.confidence,
    portion_uncertainty: item.portion_uncertainty,
    ingredients: item.ingredients,
  };
}

export default function MealEdit() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const timezone = session?.profile.timezone ?? null;
  const resource = useResource<{ meal: Meal }>(`meal:${id ?? ''}`, () => api.meals.get(id as string));
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('12:00');
  const [rows, setRows] = useState<EditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meal = resource.data?.meal;

  useEffect(() => {
    if (!meal) return;
    setMealType(meal.meal_type);
    setTitle(meal.title ?? '');
    setNotes(meal.notes ?? '');
    setDate(meal.date);
    setTime(
      new Intl.DateTimeFormat('en', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: timezone ?? 'UTC',
      }).format(new Date(meal.eaten_at)),
    );
    setRows(meal.items.map(toRow));
  }, [meal, timezone]);

  const totals = useMemo(
    () =>
      roundNutrition(
        rows.reduce<NutritionFacts>(
          (sum, row) => {
            const grams = Number(row.gramsInput);
            const nutrition = row.per100g && grams > 0 ? scaleNutrition(row.per100g, grams) : row.nutrition;
            return {
              kcal: sum.kcal + nutrition.kcal,
              protein: sum.protein + nutrition.protein,
              carbs: sum.carbs + nutrition.carbs,
              fat: sum.fat + nutrition.fat,
              fiber: (sum.fiber ?? 0) + (nutrition.fiber ?? 0),
            };
          },
          { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        ),
      ),
    [rows],
  );

  async function save() {
    if (!meal) return;
    const invalid = rows.find((row) => !Number.isFinite(Number(row.gramsInput)) || Number(row.gramsInput) <= 0);
    if (invalid) {
      setError(`Enter a gram amount for “${invalid.name}”.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.meals.update(meal.id, {
        meal_type: mealType,
        title: title.trim() || null,
        notes: notes.trim() || null,
        eaten_at: zonedDateTimeToUtc(date, time, timezone ?? 'UTC').toISOString(),
        items: rows.map((row) => {
          const grams = Number(row.gramsInput);
          const nutrition = row.per100g ? scaleNutrition(row.per100g, grams) : row.nutrition;
          return {
            food_id: row.food_id,
            name: row.name,
            quantity: row.quantity,
            unit: row.unit,
            grams,
            nutrition: {
              kcal: Math.round(nutrition.kcal * 10) / 10,
              protein_g: Math.round(nutrition.protein * 10) / 10,
              carbs_g: Math.round(nutrition.carbs * 10) / 10,
              fat_g: Math.round(nutrition.fat * 10) / 10,
              fiber_g: nutrition.fiber === undefined ? null : Math.round(nutrition.fiber * 10) / 10,
            },
            source: row.source,
            confidence: row.confidence,
            portion_uncertainty: row.portion_uncertainty,
            ingredients: row.ingredients,
          };
        }),
      });
      toast.push('Meal updated.', 'success');
      navigate(`/app?date=${date}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!meal) return;
    setBusy(true);
    try {
      await api.meals.remove(meal.id);
      toast.push('Meal deleted.', 'success');
      navigate(`/app?date=${meal.date}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  if (resource.loading && !meal) return <Loading label="Loading meal…" />;
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />;
  if (!meal) return null;

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div>
          <h1>{mealLabel(meal.meal_type)}</h1>
          <p className="muted small">{prettyDateLong(meal.date)} · logged {timeOfDay(meal.eaten_at, timezone)}</p>
        </div>
        <span className={`pill ${meal.source === 'ai' ? 'pill-amber' : 'pill-green'}`}>
          {meal.source === 'ai' ? 'Photo estimate' : meal.source === 'plan' ? 'From a plan' : 'Manual entry'}
        </span>
      </div>

      <Card className="card-pad stack">
        <div className="field-grid two">
          <Field label="Meal" htmlFor="meal-type">
            <select id="meal-type" className="select" value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
              {MEAL_TYPES.map((type) => <option key={type} value={type}>{mealLabel(type)}</option>)}
            </select>
          </Field>
          <Field label="What was it?" htmlFor="meal-title" optional>
            <input id="meal-title" className="input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Lunch with family" />
          </Field>
        </div>
        <div className="field-grid two">
          <Field label="Date" htmlFor="meal-date">
            <input id="meal-date" className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Time" htmlFor="meal-time">
            <input id="meal-time" className="input" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="list-card" as="section">
        {rows.map((row) => {
          const grams = Number(row.gramsInput);
          const nutrition = row.per100g && grams > 0 ? scaleNutrition(row.per100g, grams) : row.nutrition;
          return (
            <div key={row.id} className="meal-section">
              <div className="row-between" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="list-title">{row.name}</div>
                  <div className="list-sub">
                    {Math.round(nutrition.kcal)} kcal · {row.food_id ? 'Catalog value' : 'Your value'}
                  </div>
                </div>
                <div className="input-group" style={{ width: 110, flex: 'none' }}>
                  <input
                    className="quantity-input"
                    type="number"
                    min={1}
                    aria-label={`Grams of ${row.name}`}
                    value={row.gramsInput}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((entry) => (entry.id === row.id ? { ...entry, gramsInput: event.target.value } : entry)),
                      )
                    }
                  />
                  <span className="tiny muted" style={{ alignSelf: 'center' }}>g</span>
                </div>
                <IconButton
                  icon="trash"
                  label={`Remove ${row.name}`}
                  onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}
                />
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <div className="card-pad stack-sm">
            <p className="muted small">No items left. Add a meal instead.</p>
            <Link to={`/app/log?date=${meal.date}&meal=${mealType}`} className="btn btn-sm btn-secondary">Log a new meal</Link>
          </div>
        ) : null}
      </Card>

      <Card className="card-pad stack">
        <Field label="Notes" htmlFor="meal-notes" optional>
          <textarea id="meal-notes" className="textarea" value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <div className="row-between">
          <div>
            <strong className="mono" style={{ fontSize: '1.5rem' }}>{totals.kcal} kcal</strong>
            <div className="tiny muted">{totals.protein} g protein · {totals.carbs} g carbs · {totals.fat} g fat</div>
          </div>
          <span className="pill">Updated estimate</span>
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="row wrap">
          <Button variant="primary" loading={busy} onClick={() => void save()} disabled={rows.length === 0}>
            Save changes
          </Button>
          <Link to={`/app?date=${meal.date}`} className="btn btn-ghost">Cancel</Link>
          <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Delete</Button>
        </div>
        <p className="hint">
          Nutrition for catalog foods follows the catalog for the gram amount you enter. For photo or custom items, the values stay as reviewed.
        </p>
      </Card>

      <Link to={`/app/log?date=${meal.date}&meal=${mealType}`} className="btn btn-secondary btn-sm">
        <Icon name="plus" /> Add another meal
      </Link>

      {confirmDelete ? (
        <Modal
          title="Delete this meal?"
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button variant="danger" loading={busy} onClick={() => void remove()}>Delete meal</Button>
            </>
          }
        >
          <p className="small muted">
            This removes the meal and its items from your history. Daily totals and rewards already earned stay as they were.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
