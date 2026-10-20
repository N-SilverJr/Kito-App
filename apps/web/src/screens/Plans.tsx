import { useEffect, useMemo, useState } from 'react';
import { MEAL_TYPES, type MealPlan, type MealType, type PlanPreferences } from '@nutripals/core';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Modal, Segmented, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useResource } from '../lib/hooks';
import { grams, kcal, mealLabel, prettyDate, volumeText } from '../lib/format';

const DIET_OPTIONS = ['none', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'low-carb'];
const COMMON_ALLERGIES = ['peanuts', 'tree nuts', 'dairy', 'gluten', 'soy', 'eggs', 'fish', 'shellfish'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Plans() {
  const { session, refresh } = useAuth();
  const toast = useToast();
  const units = session?.preferences.unit_system ?? 'metric';
  const resource = useResource<{ plans: MealPlan[] }>(`plans:${session?.user.id ?? ''}`, () => api.plans.list());
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{ id: string; title: string; ingredients: string; instructions: string } | null>(null);

  const [form, setForm] = useState<PlanPreferences>({
    days: 7,
    meal_types: ['breakfast', 'lunch', 'dinner'],
    dietary_preferences: session?.preferences.dietary_preferences ?? [],
    allergies: session?.preferences.allergies ?? [],
    available_ingredients: [],
    budget: session?.preferences.weekly_plan_budget ?? 'medium',
    max_cook_minutes: 45,
    servings: 2,
    local_foods: true,
    notes: '',
  });
  const [ingredientInput, setIngredientInput] = useState('');

  const plans = useMemo(() => resource.data?.plans ?? [], [resource.data]);
  const active = plans.find((plan) => plan.id === selected) ?? plans[0] ?? null;

  useEffect(() => {
    if (!selected && plans[0]) setSelected(plans[0].id);
  }, [plans, selected]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await api.plans.generate(form);
      setShowForm(false);
      setSelected(result.plan.id);
      resource.reload();
      void refresh();
      toast.push(`Plan created with ${result.plan.items.length} meals.`, 'success');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function saveItem() {
    if (!active || !editItem) return;
    setBusy(editItem.id);
    setError(null);
    try {
      const items = active.items.map((item) =>
        item.id === editItem.id
          ? {
              id: item.id,
              title: editItem.title,
              ingredients: editItem.ingredients.split(',').map((value) => value.trim()).filter(Boolean),
              instructions: editItem.instructions,
            }
          : { id: item.id, title: item.title, ingredients: item.ingredients, instructions: item.instructions },
      );
      await api.plans.update(active.id, { items });
      setEditItem(null);
      resource.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api.plans.remove(id);
      if (selected === id) setSelected(null);
      resource.reload();
      toast.push('Plan deleted.', 'default');
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
          <h1>Meal plans</h1>
          <p className="muted small">
            Plans use your catalog and your preferences. Nutrition per meal is an estimate, not a verified lab value.
          </p>
        </div>
        <Button variant="primary" icon="sparkles" onClick={() => setShowForm(true)}>
          New plan
        </Button>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {resource.loading && !resource.data ? <Loading label="Loading your plans…" /> : null}
      {resource.error && !resource.data ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

      {resource.data && plans.length === 0 ? (
        <Card className="card-pad">
          <EmptyState icon="calendar" title="No plans yet">
            Create a plan and NutriPals will assemble affordable meals from your catalog, plus a shopping list. You can
            edit every meal afterwards.
          </EmptyState>
        </Card>
      ) : null}

      {plans.length > 0 ? (
        <div className="dash-grid">
          <div className="dash-main stack-lg">
            <div className="plan-tabs" role="tablist" aria-label="Your meal plans">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  role="tab"
                  aria-selected={active?.id === plan.id}
                  className={`plan-tab ${active?.id === plan.id ? 'active' : ''}`}
                  onClick={() => setSelected(plan.id)}
                >
                  <strong>{plan.title}</strong>
                  <span className="tiny muted">Week of {prettyDate(plan.week_start)}</span>
                </button>
              ))}
            </div>

            {active ? (
              <>
                <Card className="card-pad stack-sm">
                  <div className="row-between wrap">
                    <h2>{active.title}</h2>
                    <Button variant="ghost" size="sm" icon="trash" loading={busy === active.id} onClick={() => void remove(active.id)}>
                      Delete plan
                    </Button>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="pill">{active.preferences.days} days</span>
                    <span className="pill">{active.preferences.servings} servings</span>
                    <span className="pill pill-amber">{active.preferences.budget} budget</span>
                    <span className="pill">{active.preferences.max_cook_minutes} min max</span>
                    {active.preferences.allergies.length > 0 ? (
                      <span className="pill">Avoids: {active.preferences.allergies.join(', ')}</span>
                    ) : null}
                  </div>
                  <p className="tiny muted">
                    Allergies were checked against every component before this plan was shown. Always double-check labels
                    when you shop.
                  </p>
                </Card>

                {Array.from({ length: active.preferences.days }).map((_, dayIndex) => {
                  const dayItems = active.items.filter((item) => item.day_index === dayIndex);
                  if (dayItems.length === 0) return null;
                  return (
                    <Card key={dayIndex} className="card-pad stack-sm">
                      <h3>{DAY_NAMES[dayIndex] ?? `Day ${dayIndex + 1}`}</h3>
                      <div className="plan-day">
                        {dayItems.map((item) => (
                          <div key={item.id} className="plan-item">
                            <div className="row-between wrap">
                              <div>
                                <div className="strong">
                                  {mealLabel(item.meal_type)} · {item.title}
                                </div>
                                <div className="tiny muted">
                                  {kcal(item.totals.kcal)} kcal · {grams(item.totals.protein)} protein ·{' '}
                                  {grams(item.totals.carbs)} carbs · {grams(item.totals.fat)} fat
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon="edit"
                                onClick={() =>
                                  setEditItem({
                                    id: item.id,
                                    title: item.title,
                                    ingredients: item.ingredients.join(', '),
                                    instructions: item.instructions,
                                  })
                                }
                              >
                                Edit
                              </Button>
                            </div>
                            <ul className="ingredient-list">
                              {item.components.map((component) => (
                                <li key={`${item.id}-${component.name}`}>
                                  {component.name} · {grams(component.grams)}
                                  {component.food_id ? '' : ' (estimate)'}
                                </li>
                              ))}
                            </ul>
                            <p className="small">{item.instructions}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}

                <Card className="card-pad stack-sm">
                  <h2>Shopping list</h2>
                  {active.shopping_list.length === 0 ? (
                    <p className="small muted">Nothing to buy — this plan is empty.</p>
                  ) : (
                    <ul className="shopping-list">
                      {active.shopping_list.map((entry) => (
                        <li key={entry.name}>
                          <span className="grow">{entry.name}</span>
                          <span className="tiny muted">{entry.category}</span>
                          <strong>
                            {units === 'imperial'
                              ? `${Math.round((entry.grams / 453.592) * 10) / 10} lb`
                              : entry.grams >= 1000
                                ? `${(entry.grams / 1000).toFixed(1)} kg`
                                : grams(entry.grams)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="tiny muted">
                    Quantities are estimates for {active.preferences.servings} serving
                    {active.preferences.servings === 1 ? '' : 's'} per meal. Adjust to what you actually buy.
                  </p>
                </Card>
              </>
            ) : null}
          </div>

          <aside className="dash-side stack-lg">
            <Card className="card-pad stack-sm">
              <h3>How planning works</h3>
              <ul className="observation-list">
                <li>Meals are built from foods already in your catalog, so regional dishes are used when available.</li>
                <li>Anything containing one of your allergens is filtered out before you see it.</li>
                <li>Cheap staples (beans, maize, greens, potatoes) are preferred on a low budget.</li>
                <li>Every plan stays editable — you are not locked into the suggestion.</li>
              </ul>
            </Card>
            {active ? (
              <Card className="card-pad stack-sm">
                <h3>Plan totals</h3>
                <div className="mini-stats">
                  <div>
                    <span className="tiny muted">Meals</span>
                    <strong>{active.items.length}</strong>
                  </div>
                  <div>
                    <span className="tiny muted">Avg kcal / meal</span>
                    <strong>
                      {kcal(active.items.reduce((sum, item) => sum + item.totals.kcal, 0) / Math.max(1, active.items.length))}
                    </strong>
                  </div>
                  <div>
                    <span className="tiny muted">Water target</span>
                    <strong>{volumeText(session?.preferences.water_target_ml ?? 2000, units)}</strong>
                  </div>
                </div>
              </Card>
            ) : null}
            <Card className="card-pad stack-sm">
              <h3>Planning is optional</h3>
              <p className="small muted">
                You can log food without ever creating a plan. Nothing here is required to use NutriPals.
              </p>
              <p className="tiny muted">
                Plans aim for balanced, realistic meals. They do not promise weight loss and are not medical nutrition
                therapy.
              </p>
            </Card>
          </aside>
        </div>
      ) : null}

      {showForm ? (
        <Modal
          title="New meal plan"
          onClose={() => setShowForm(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" loading={generating} onClick={() => void generate()}>
                Generate plan
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="Days to plan" htmlFor="plan-days">
              <Segmented
                label="Days to plan"
                value={String(form.days)}
                onChange={(value) => setForm((current) => ({ ...current, days: Number(value) }))}
                options={[
                  { value: '3', label: '3 days' },
                  { value: '5', label: '5 days' },
                  { value: '7', label: '7 days' },
                ]}
              />
            </Field>

            <Field label="Meals per day" htmlFor="plan-meals" hint="Pick the meals you actually eat.">
              <div className="chip-row">
                {MEAL_TYPES.map((type) => {
                  const selectedType = form.meal_types.includes(type);
                  return (
                    <Chip
                      key={type}
                      pressed={selectedType}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          meal_types: (selectedType
                            ? current.meal_types.filter((value) => value !== type)
                            : [...current.meal_types, type]) as MealType[],
                        }))
                      }
                    >
                      {mealLabel(type)}
                    </Chip>
                  );
                })}
              </div>
            </Field>

            <Field label="Dietary preference" htmlFor="plan-diet">
              <div className="chip-row">
                {DIET_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    pressed={form.dietary_preferences.includes(option)}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        dietary_preferences: option === 'none'
                          ? []
                          : current.dietary_preferences.includes(option)
                            ? current.dietary_preferences.filter((value) => value !== option)
                            : [...current.dietary_preferences, option],
                      }))
                    }
                  >
                    {option}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Allergies to avoid" htmlFor="plan-allergies" hint="Meals containing these are filtered out.">
              <div className="chip-row">
                {COMMON_ALLERGIES.map((allergen) => (
                  <Chip
                    key={allergen}
                    pressed={form.allergies.includes(allergen)}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        allergies: current.allergies.includes(allergen)
                          ? current.allergies.filter((value) => value !== allergen)
                          : [...current.allergies, allergen],
                      }))
                    }
                  >
                    {allergen}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Budget" htmlFor="plan-budget">
              <Segmented
                label="Budget"
                value={form.budget}
                onChange={(value) => setForm((current) => ({ ...current, budget: value }))}
                options={[
                  { value: 'low' as const, label: 'Low cost' },
                  { value: 'medium' as const, label: 'Medium' },
                  { value: 'high' as const, label: 'Flexible' },
                ]}
              />
            </Field>

            <div className="field-grid two">
              <Field label="Max cook time (minutes)" htmlFor="plan-cook">
                <input
                  id="plan-cook"
                  className="input"
                  type="number"
                  min={5}
                  max={240}
                  value={form.max_cook_minutes}
                  onChange={(event) => setForm((current) => ({ ...current, max_cook_minutes: Number(event.target.value) }))}
                />
              </Field>
              <Field label="Servings per meal" htmlFor="plan-servings">
                <input
                  id="plan-servings"
                  className="input"
                  type="number"
                  min={1}
                  max={12}
                  value={form.servings}
                  onChange={(event) => setForm((current) => ({ ...current, servings: Number(event.target.value) }))}
                />
              </Field>
            </div>

            <Field label="Ingredients you already have" htmlFor="plan-ingredients" hint="Type one and press Enter.">
              <input
                id="plan-ingredients"
                className="input"
                value={ingredientInput}
                placeholder="e.g. beans, rice, spinach"
                onChange={(event) => setIngredientInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  const value = ingredientInput.trim();
                  if (!value) return;
                  setForm((current) => ({ ...current, available_ingredients: [...current.available_ingredients, value] }));
                  setIngredientInput('');
                }}
              />
            </Field>
            {form.available_ingredients.length > 0 ? (
              <div className="chip-row">
                {form.available_ingredients.map((ingredient) => (
                  <Chip
                    key={ingredient}
                    pressed
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        available_ingredients: current.available_ingredients.filter((value) => value !== ingredient),
                      }))
                    }
                  >
                    {ingredient} ×
                  </Chip>
                ))}
              </div>
            ) : null}

            <label className="check-row">
              <input
                type="checkbox"
                checked={form.local_foods}
                onChange={(event) => setForm((current) => ({ ...current, local_foods: event.target.checked }))}
              />
              <span className="small">
                Prefer locally available foods and regional dishes{' '}
                <Icon name="leaf" size={14} />
              </span>
            </label>

            <Field label="Anything else" htmlFor="plan-notes" optional>
              <textarea
                id="plan-notes"
                className="input"
                rows={2}
                maxLength={300}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="e.g. one-pot meals, no oven"
              />
            </Field>
          </div>
        </Modal>
      ) : null}

      {editItem ? (
        <Modal
          title="Edit meal"
          onClose={() => setEditItem(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button variant="primary" loading={busy === editItem.id} onClick={() => void saveItem()}>
                Save changes
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="Meal title" htmlFor="plan-item-title">
              <input
                id="plan-item-title"
                className="input"
                value={editItem.title}
                maxLength={120}
                onChange={(event) => setEditItem({ ...editItem, title: event.target.value })}
              />
            </Field>
            <Field label="Ingredients (comma separated)" htmlFor="plan-item-ingredients">
              <textarea
                id="plan-item-ingredients"
                className="input"
                rows={2}
                value={editItem.ingredients}
                onChange={(event) => setEditItem({ ...editItem, ingredients: event.target.value })}
              />
            </Field>
            <Field label="Instructions" htmlFor="plan-item-instructions">
              <textarea
                id="plan-item-instructions"
                className="input"
                rows={4}
                value={editItem.instructions}
                onChange={(event) => setEditItem({ ...editItem, instructions: event.target.value })}
              />
            </Field>
            <p className="tiny muted">
              Editing text does not change the estimated nutrition for this meal; totals stay as originally calculated.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
