import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  MEAL_TYPES,
  resolveGrams,
  roundNutrition,
  scaleNutrition,
  zonedDateTimeToUtc,
  type Food,
  type MealType,
  type NutritionFacts,
  type ServingSize,
  type TextParseResponse,
} from '@nutripals/core';
import { Button, Card, Chip, EmptyState, ErrorState, Field, IconButton, Loading, Modal, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDebounced, useResource } from '../lib/hooks';
import { mealLabel, prettyDate, todayKey } from '../lib/format';

interface TrayItem {
  id: string;
  foodId: string | null;
  name: string;
  grams: number;
  quantity: number;
  unit: string;
  per100g: NutritionFacts | null;
  baseNutrition: NutritionFacts | null;
  baseGrams: number;
  source: Food['source'];
}

type Tab = 'search' | 'describe' | 'barcode' | 'custom';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mealForHour(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function trayNutrition(item: TrayItem): NutritionFacts {
  if (item.per100g) return scaleNutrition(item.per100g, item.grams);
  if (item.baseNutrition) {
    const factor = item.grams / (item.baseGrams || item.grams);
    return {
      kcal: item.baseNutrition.kcal * factor,
      protein: item.baseNutrition.protein * factor,
      carbs: item.baseNutrition.carbs * factor,
      fat: item.baseNutrition.fat * factor,
      fiber: item.baseNutrition.fiber === undefined ? undefined : item.baseNutrition.fiber * factor,
    };
  }
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export default function LogFood() {
  const { session } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const timezone = session?.profile.timezone ?? null;
  const today = todayKey(timezone);
  const units = session?.preferences.unit_system ?? 'metric';
  const initialMeal = MEAL_TYPES.includes(params.get('meal') as MealType)
    ? (params.get('meal') as MealType)
    : mealForHour(new Date().getHours());
  const initialDate = params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? (params.get('date') as string) : today;

  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 280);
  const [external, setExternal] = useState(true);
  const [mealType, setMealType] = useState<MealType>(initialMeal);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const idempotency = useRef<string>(crypto.randomUUID());
  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<TextParseResponse | null>(null);
  const [parseBusy, setParseBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [custom, setCustom] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', serving: '' });
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const foods = useResource<{ foods: Food[]; external_error?: string | null }>(
    `foods:${debounced}:${external ? 'ext' : 'local'}:${session?.user.id ?? ''}`,
    () => api.foods.search(debounced, external),
  );

  const total = useMemo(() => roundNutrition(tray.reduce((sum, item) => {
    const nutrition = trayNutrition(item);
    return {
      kcal: sum.kcal + nutrition.kcal,
      protein: sum.protein + nutrition.protein,
      carbs: sum.carbs + nutrition.carbs,
      fat: sum.fat + nutrition.fat,
      fiber: (sum.fiber ?? 0) + (nutrition.fiber ?? 0),
    };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } as NutritionFacts)), [tray]);

  useEffect(() => {
    document.title = 'Log food · NutriPals';
    return () => {
      document.title = 'NutriPals';
    };
  }, []);

  function addToTray(
    food: Food,
    grams: number,
    quantity: number,
    unit: string,
    nutritionOverride: NutritionFacts | null = null,
  ) {
    setTray((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        foodId: isUuid(food.id) ? food.id : null,
        name: food.name,
        grams,
        quantity,
        unit,
        per100g: food.per_100g,
        baseNutrition: nutritionOverride,
        baseGrams: grams,
        source: food.source,
      },
    ]);
    toast.push(`${food.name} added to ${mealLabel(mealType).toLowerCase()}.`, 'success');
  }

  function addRaw(name: string, per100g: NutritionFacts | null, grams: number, source: Food['source'], foodId: string | null) {
    setTray((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        foodId,
        name,
        grams,
        quantity: grams,
        unit: 'g',
        per100g,
        baseNutrition: null,
        baseGrams: grams,
        source,
      },
    ]);
  }

  async function parseText() {
    setParseBusy(true);
    setParseError(null);
    try {
      const result = await api.parseText(text);
      setParseResult(result);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not read that description.');
    } finally {
      setParseBusy(false);
    }
  }

  async function lookupBarcode() {
    setBarcodeBusy(true);
    setBarcodeError(null);
    try {
      const { food } = await api.foods.barcode(barcode.trim());
      setSelected(food);
    } catch (error) {
      setBarcodeError(error instanceof Error ? error.message : 'Product not found.');
    } finally {
      setBarcodeBusy(false);
    }
  }

  async function createCustom() {
    setCustomError(null);
    const kcalValue = Number(custom.kcal);
    const protein = Number(custom.protein || 0);
    const carbs = Number(custom.carbs || 0);
    const fat = Number(custom.fat || 0);
    if (!custom.name.trim()) {
      setCustomError('Give this food a name.');
      return;
    }
    if (!Number.isFinite(kcalValue) || kcalValue < 0 || kcalValue > 900) {
      setCustomError('Calories per 100 g should be between 0 and 900.');
      return;
    }
    if ([protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      setCustomError('Macros should be between 0 and 100 g per 100 g.');
      return;
    }
    setCustomBusy(true);
    try {
      const servingGrams = Number(custom.serving);
      const { food } = await api.foods.create({
        name: custom.name.trim(),
        alt_names: [],
        category: 'custom',
        per_100g: {
          kcal: kcalValue,
          protein,
          carbs,
          fat,
          fiber: custom.fiber ? Number(custom.fiber) : undefined,
        },
        serving_sizes: Number.isFinite(servingGrams) && servingGrams > 0
          ? [{ unit: custom.name.trim().toLowerCase().includes('slice') ? 'slice' : 'piece', grams: servingGrams, approximate: true }]
          : [],
      });
      setSelected(food);
      setCustom({ name: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', serving: '' });
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : 'Could not save this food.');
    } finally {
      setCustomBusy(false);
    }
  }

  async function saveMeal() {
    if (tray.length === 0) return;
    if (tray.some((item) => !Number.isFinite(item.grams) || item.grams <= 0)) {
      setSaveError('Every item needs a gram amount greater than zero.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const eatenAt = zonedDateTimeToUtc(date, time || '12:00', timezone ?? 'UTC').toISOString();
      const { meal } = await api.meals.create(
        {
          meal_type: mealType,
          title: null,
          notes: null,
          eaten_at: eatenAt,
          source: 'manual',
          items: tray.map((item) => {
            const nutrition = trayNutrition(item);
            return {
              food_id: item.foodId,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              grams: item.grams,
              nutrition: {
                kcal: Math.round(nutrition.kcal * 10) / 10,
                protein_g: Math.round(nutrition.protein * 10) / 10,
                carbs_g: Math.round(nutrition.carbs * 10) / 10,
                fat_g: Math.round(nutrition.fat * 10) / 10,
                fiber_g: nutrition.fiber === undefined ? null : Math.round(nutrition.fiber * 10) / 10,
              },
              source: item.source,
            };
          }),
        },
        idempotency.current,
      );
      toast.push(`${meal.items.length} item${meal.items.length === 1 ? '' : 's'} saved to ${mealLabel(meal.meal_type).toLowerCase()}.`, 'success');
      idempotency.current = crypto.randomUUID();
      setTray([]);
      setParseResult(null);
      setText('');
      navigate(`/app?date=${meal.date}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this meal. Your items are still here.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>What did you eat?</h1>
        <p className="muted small" style={{ marginTop: 4 }}>
          {date === today ? 'Today' : prettyDate(date)} · {mealLabel(mealType)} · values are estimates you can edit.
        </p>
      </div>

      <div className="tabs" role="tablist" aria-label="Food entry method">
        {([
          ['search', 'Search'],
          ['describe', 'Describe'],
          ['barcode', 'Barcode'],
          ['custom', 'New food'],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} type="button">
            {label}
          </button>
        ))}
      </div>

      {tab === 'search' ? (
        <div className="stack">
          <div className="search-box">
            <Icon name="search" />
            <input
              className="input"
              type="search"
              placeholder="Search rice, isombe, eggs, milk…"
              aria-label="Search foods"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={external} onChange={(event) => setExternal(event.target.checked)} />
            <span>Include packaged foods and reference data from Open Food Facts / USDA</span>
          </label>
          <Card className="list-card">
            {foods.loading ? <Loading label="Searching…" /> : null}
            {foods.error ? <ErrorState message={foods.error} onRetry={foods.reload} /> : null}
            {!foods.loading && !foods.error && foods.data?.foods.length === 0 ? (
              <EmptyState title="No matches" icon="search">
                Try a simpler name, add a custom food, or describe the meal instead.
                <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 10 }} onClick={() => setTab('custom')}>
                  Create a custom food
                </button>
              </EmptyState>
            ) : null}
            <div className="result-list">
              {foods.data?.foods.map((food) => (
                <button key={food.id} type="button" className="result" onClick={() => setSelected(food)}>
                  <div className="grow">
                    <div className="result-name">{food.name}</div>
                    <div className="result-sub">
                      {food.brand ? `${food.brand} · ` : ''}
                      {food.source === 'catalog' ? 'Catalog' : food.source === 'open_food_facts' ? 'Open Food Facts' : food.source === 'usda_fdc' ? 'USDA' : 'Custom'}
                      {food.allergens && food.allergens.length > 0 ? ` · contains ${food.allergens.join(', ')}` : ''}
                    </div>
                  </div>
                  <span className="result-kcal">{Math.round(food.per_100g.kcal)} kcal</span>
                  <Icon name="plus" size={18} />
                </button>
              ))}
            </div>
            {foods.data?.external_error ? (
              <p className="tiny muted" style={{ padding: 12 }}>External search unavailable right now — local foods are shown.</p>
            ) : null}
          </Card>
          <p className="tiny muted">
            Nutrition values are per 100 g. Portion weights are approximate unless you measure them.
          </p>
        </div>
      ) : null}

      {tab === 'describe' ? (
        <div className="stack">
          <Card className="card-pad stack">
            <Field label="Describe what you ate" htmlFor="describe-text" hint="For example: “2 eggs and 150g rice” or “one cup of beans”.">
              <textarea
                id="describe-text"
                className="textarea"
                value={text}
                maxLength={400}
                onChange={(event) => setText(event.target.value)}
                placeholder="2 eggs and 150g rice"
              />
            </Field>
            {parseError ? <div className="form-error" role="alert">{parseError}</div> : null}
            <Button variant="primary" loading={parseBusy} onClick={() => void parseText()} disabled={text.trim().length < 2}>
              Read this description
            </Button>
            <p className="hint">
              This uses our local food catalog for deterministic matching — no AI key needed. Unmatched words are listed, never guessed.
            </p>
          </Card>
          {parseResult ? (
            <Card className="card-pad stack">
              <h3>Matched foods</h3>
              {parseResult.items.length === 0 ? <p className="muted small">Nothing matched. Try food names from the catalog.</p> : null}
              {parseResult.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="row-between" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <div className="grow">
                    <strong>{item.name}</strong>
                    <div className="tiny muted">
                      {item.grams ? `${Math.round(item.grams)} g` : item.note} · {item.nutrition ? `${item.nutrition.kcal} kcal` : 'needs a weight'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!item.grams}
                    onClick={() => {
                      if (!item.food || !item.grams) return;
                      addRaw(item.name, item.food.per_100g, item.grams, item.food.source, isUuid(item.food.id) ? item.food.id : null);
                    }}
                  >
                    Add
                  </Button>
                </div>
              ))}
              {parseResult.unmatched.length > 0 ? (
                <p className="tiny muted">Not recognised: {parseResult.unmatched.join(', ')}. Search for them individually or create a custom food.</p>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'barcode' ? (
        <Card className="card-pad stack">
          <Field label="Product barcode" htmlFor="barcode" hint="Packaged products are looked up live in Open Food Facts.">
            <input
              id="barcode"
              className="input"
              inputMode="numeric"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 3017620422003"
              maxLength={14}
            />
          </Field>
          {barcodeError ? <div className="form-error" role="alert">{barcodeError}</div> : null}
          <Button
            variant="primary"
            loading={barcodeBusy}
            onClick={() => void lookupBarcode()}
            disabled={!/^\d{8,14}$/.test(barcode.trim())}
          >
            Look up barcode
          </Button>
          {!session?.preferences ? null : (
            <p className="hint">
              Data from Open Food Facts is community-maintained. Always check the label for allergens.
            </p>
          )}
        </Card>
      ) : null}

      {tab === 'custom' ? (
        <Card className="card-pad stack">
          <h3>Create a custom food</h3>
          <p className="hint">Values per 100 g. Useful for home dishes that are not in the catalog.</p>
          <Field label="Food name" htmlFor="custom-name">
            <input id="custom-name" className="input" value={custom.name} onChange={(event) => setCustom({ ...custom, name: event.target.value })} placeholder="Mum’s bean stew" />
          </Field>
          <div className="field-grid two">
            {([
              ['kcal', 'Calories (kcal)', 'custom-kcal'],
              ['protein', 'Protein (g)', 'custom-protein'],
              ['carbs', 'Carbs (g)', 'custom-carbs'],
              ['fat', 'Fat (g)', 'custom-fat'],
              ['fiber', 'Fiber (g)', 'custom-fiber'],
              ['serving', 'One piece weighs (g)', 'custom-serving'],
            ] as Array<[keyof typeof custom, string, string]>).map(([key, label, id]) => (
              <Field key={key} label={label} htmlFor={id} optional={key === 'fiber' || key === 'serving'}>
                <input
                  id={id}
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  value={custom[key]}
                  onChange={(event) => setCustom({ ...custom, [key]: event.target.value })}
                />
              </Field>
            ))}
          </div>
          {customError ? <div className="form-error" role="alert">{customError}</div> : null}
          <Button variant="primary" loading={customBusy} onClick={() => void createCustom()}>
            Save food and choose a portion
          </Button>
        </Card>
      ) : null}

      {tray.length > 0 ? (
        <div className="tray">
          <div className="tray-inner stack-sm">
            <div className="row-between">
              <strong>This meal</strong>
              <span className="pill pill-green">{total.kcal} kcal</span>
            </div>
            {tray.map((item) => {
              const nutrition = trayNutrition(item);
              return (
                <div key={item.id} className="tray-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong truncate">{item.name}</div>
                    <div className="tiny muted">{Math.round(nutrition.kcal)} kcal</div>
                  </div>
                  <div className="input-group" style={{ gap: 4 }}>
                    <input
                      className="quantity-input"
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={10000}
                      aria-label={`Grams of ${item.name}`}
                      value={Math.round(item.grams)}
                      onChange={(event) => {
                        const grams = Number(event.target.value);
                        setTray((current) =>
                          current.map((entry) => (entry.id === item.id ? { ...entry, grams: Number.isFinite(grams) ? grams : 0 } : entry)),
                        );
                      }}
                    />
                    <span className="tiny muted" style={{ alignSelf: 'center' }}>g</span>
                  </div>
                  <IconButton icon="trash" label={`Remove ${item.name}`} onClick={() => setTray((current) => current.filter((entry) => entry.id !== item.id))} />
                </div>
              );
            })}
            <div className="divider" />
            <div className="row-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <select className="select" style={{ maxWidth: 150 }} value={mealType} onChange={(event) => setMealType(event.target.value as MealType)} aria-label="Meal type">
                {MEAL_TYPES.map((type) => (
                  <option key={type} value={type}>{mealLabel(type)}</option>
                ))}
              </select>
              <input className="input" style={{ maxWidth: 150 }} type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Meal date" />
              <input className="input" style={{ maxWidth: 120 }} type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Meal time" />
            </div>
            {saveError ? <div className="form-error" role="alert">{saveError}</div> : null}
            <Button variant="primary" block loading={saving} onClick={() => void saveMeal()}>
              Save {mealLabel(mealType)} · {total.kcal} kcal
            </Button>
            <p className="tiny muted">
              Estimates: {total.protein} g protein · {total.carbs} g carbs · {total.fat} g fat
              {total.fiber !== null ? ` · ${total.fiber} g fiber` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <div className="row-between">
        <Link to="/app/scan" className="btn btn-secondary btn-sm"><Icon name="camera" /> Use a photo instead</Link>
        <Link to="/app" className="btn btn-ghost btn-sm">Back to today</Link>
      </div>

      {selected ? (
        <PortionModal
          food={selected}
          units={units}
          onClose={() => setSelected(null)}
          onAdd={(grams, quantity, unit) => {
            addToTray(selected, grams, quantity, unit);
            setSelected(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PortionModal({
  food,
  units,
  onClose,
  onAdd,
}: {
  food: Food;
  units: 'metric' | 'imperial';
  onClose: () => void;
  onAdd: (grams: number, quantity: number, unit: string) => void;
}) {
  const servingOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: ServingSize[] = [];
    for (const serving of food.serving_sizes) {
      const key = serving.unit.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        options.push(serving);
      }
    }
    return options;
  }, [food.serving_sizes]);
  const defaultServing = servingOptions[0];
  const [unit, setUnit] = useState(defaultServing?.unit ?? 'g');
  const [quantity, setQuantity] = useState(defaultServing ? 1 : 100);
  const [manualGrams, setManualGrams] = useState<number | ''>(defaultServing?.grams ?? 100);
  const resolved = resolveGrams(quantity, unit, food.serving_sizes);
  const grams = resolved.grams ?? (typeof manualGrams === 'number' ? manualGrams : null);
  const nutrition = grams ? roundNutrition(scaleNutrition(food.per_100g, grams)) : null;
  const unitOptions = ['g', ...servingOptions.map((serving) => serving.unit)];

  return (
    <Modal
      title={food.name}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!grams || grams <= 0}
            onClick={() => {
              if (!grams) return;
              onAdd(grams, quantity, unit);
            }}
          >
            Add to meal
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="small muted">
          {food.brand ? `${food.brand} · ` : ''}per 100 g: {Math.round(food.per_100g.kcal)} kcal · {food.per_100g.protein} g protein
        </p>
        <div className="field-grid two">
          <Field label="Unit" htmlFor="portion-unit">
            <select
              id="portion-unit"
              className="select"
              value={unit}
              onChange={(event) => {
                const next = event.target.value;
                setUnit(next);
                const serving = food.serving_sizes.find((entry) => entry.unit === next);
                if (next === 'g') {
                  setQuantity(100);
                  setManualGrams(100);
                } else if (serving) {
                  setQuantity(1);
                  setManualGrams(serving.grams);
                }
              }}
            >
              {unitOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label={unit === 'g' ? 'Grams' : `Number of ${unit}s`} htmlFor="portion-quantity">
            <input
              id="portion-quantity"
              className="input"
              type="number"
              inputMode="decimal"
              min={unit === 'g' ? 1 : 0.25}
              step={unit === 'g' ? 10 : 0.25}
              value={quantity}
              onChange={(event) => {
                const next = Number(event.target.value);
                setQuantity(next);
                if (unit === 'g') setManualGrams(next);
              }}
            />
          </Field>
        </div>
        {!resolved.grams ? (
          <Field
            label="Grams (we don’t have a reliable conversion)"
            htmlFor="portion-manual"
            hint="A household portion can’t be converted exactly. Enter a weight if you know one."
          >
            <input
              id="portion-manual"
              className="input"
              type="number"
              min={1}
              value={manualGrams}
              onChange={(event) => setManualGrams(event.target.value === '' ? '' : Number(event.target.value))}
            />
          </Field>
        ) : (
          <p className="hint">
            About {Math.round(resolved.grams)} g{resolved.approximate ? ' (household estimate)' : ''}
            {resolved.note ? ` — ${resolved.note}` : ''}
          </p>
        )}
        {nutrition ? (
          <div className="card-inset">
            <div className="row-between">
              <strong>{nutrition.kcal} kcal</strong>
              <span className="tiny muted">{units === 'imperial' ? 'Values are per serving' : 'Values are per portion'}</span>
            </div>
            <div className="macro-grid" style={{ marginTop: 10 }}>
              <div className="stat-tile"><strong>{nutrition.protein} g</strong><span>protein</span></div>
              <div className="stat-tile"><strong>{nutrition.carbs} g</strong><span>carbs</span></div>
              <div className="stat-tile"><strong>{nutrition.fat} g</strong><span>fat</span></div>
            </div>
          </div>
        ) : null}
        <p className="tiny muted">
          {food.source === 'catalog' ? 'Catalog reference value' : food.source === 'open_food_facts' ? 'Open Food Facts community data' : food.source === 'usda_fdc' ? 'USDA FoodData Central' : 'Entered by you'} — estimates, not laboratory measurements.
        </p>
        <div className="chip-row">
          <Chip pressed={false} onClick={() => { setUnit('g'); setQuantity(100); setManualGrams(100); }}>Reset to 100 g</Chip>
        </div>
      </div>
    </Modal>
  );
}
