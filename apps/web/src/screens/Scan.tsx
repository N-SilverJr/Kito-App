import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MEAL_TYPES,
  roundNutrition,
  scaleNutrition,
  sumNutrition,
  type AiStatus,
  type AnalyzeResponse,
  type AnalyzedItem,
  type MealType,
  type NutritionFacts,
} from '@nutripals/core';
import { Button, Card, ErrorState, Field, Loading, Modal, ProgressRing, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage, useResource } from '../lib/hooks';
import { compressImageFile, ImageError } from '../lib/image';
import { mealLabel, sourceLabel } from '../lib/format';

interface EditableItem extends AnalyzedItem {
  key: string;
  nutrition: NutritionFacts;
  per100g: NutritionFacts | null;
  gramsInput: string;
}

function mealForHour(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function makeItem(item: AnalyzedItem, index: number): EditableItem {
  const nutrition: NutritionFacts = {
    kcal: item.kcal,
    protein: item.protein_g,
    carbs: item.carbs_g,
    fat: item.fat_g,
    fiber: item.fiber_g ?? undefined,
  };
  const canScale = item.data_source !== 'ai_estimate' && item.grams !== null && item.grams > 0;
  const per100g = canScale ? scaleNutrition(nutrition, 100 / (item.grams as number)) : null;
  return {
    ...item,
    key: `${index}-${item.name}`,
    nutrition,
    per100g,
    gramsInput: item.grams === null ? '' : String(Math.round(item.grams)),
  };
}

export default function Scan() {
  const { session } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const status = useResource<AiStatus>('ai-status', () => api.ai.status());
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [mealType, setMealType] = useState<MealType>(mealForHour(new Date().getHours()));
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', grams: '', kcal: '', protein: '', carbs: '', fat: '' });

  const totals = useMemo(() => {
    return roundNutrition(
      sumNutrition(
        items.map((item) => {
          const grams = Number(item.gramsInput);
          if (item.per100g && Number.isFinite(grams) && grams > 0) return scaleNutrition(item.per100g, grams);
          return item.nutrition;
        }),
      ),
    );
  }, [items]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    setAnalysisError(null);
    setAnalysis(null);
    setItems([]);
    try {
      const dataUrl = await compressImageFile(file);
      setImage(dataUrl);
    } catch (error) {
      setImageError(error instanceof ImageError ? error.message : 'Could not read that image.');
    }
  }

  async function analyze() {
    if (!image) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await api.ai.analyze({ image, meal_type: mealType });
      setAnalysis(result);
      setItems(result.items.map(makeItem));
      setTitle(result.dish_name);
    } catch (error) {
      setAnalysisError(errorMessage(error));
    } finally {
      setAnalyzing(false);
    }
  }

  function reset() {
    setImage(null);
    setAnalysis(null);
    setItems([]);
    setTitle('');
    setAnalysisError(null);
    setSaveError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        if (patch.name !== undefined && next.matched_food_id && patch.name !== next.matched_food_name) {
          next.matched_food_id = null;
          next.matched_food_name = null;
        }
        if (patch.gramsInput !== undefined && next.per100g) {
          const grams = Number(patch.gramsInput);
          if (Number.isFinite(grams) && grams > 0) next.nutrition = scaleNutrition(next.per100g, grams);
        }
        return next;
      }),
    );
  }

  function editNutrition(key: string, field: keyof NutritionFacts, value: string) {
    const numeric = Number(value);
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        return {
          ...item,
          per100g: null,
          nutrition: { ...item.nutrition, [field]: Number.isFinite(numeric) ? Math.max(0, numeric) : 0 },
        };
      }),
    );
  }

  async function save() {
    if (!analysis) return;
    setSaveError(null);
    const invalid = items.find((item) => !Number.isFinite(Number(item.gramsInput)) || Number(item.gramsInput) <= 0);
    if (invalid) {
      setSaveError(`Add a gram weight for “${invalid.name}” before saving. Photo portions are estimates.`);
      return;
    }
    setSaving(true);
    try {
      const { meal } = await api.meals.create({
        meal_type: mealType,
        title: title.trim() || analysis.dish_name,
        notes: analysis.observation,
        eaten_at: new Date().toISOString(),
        source: 'ai',
        ai_analysis_id: analysis.analysis_id,
        items: items.map((item) => {
          const grams = Number(item.gramsInput);
          const nutrition = item.per100g ? scaleNutrition(item.per100g, grams) : item.nutrition;
          return {
            food_id: item.matched_food_id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            grams,
            nutrition: {
              kcal: Math.round(nutrition.kcal * 10) / 10,
              protein_g: Math.round(nutrition.protein * 10) / 10,
              carbs_g: Math.round(nutrition.carbs * 10) / 10,
              fat_g: Math.round(nutrition.fat * 10) / 10,
              fiber_g: nutrition.fiber === undefined ? null : Math.round(nutrition.fiber * 10) / 10,
            },
            source: item.data_source,
            confidence: item.confidence,
            portion_uncertainty: item.portion_uncertainty,
            ingredients: item.ingredients,
          };
        }),
      });
      toast.push(`Saved ${meal.items.length} component${meal.items.length === 1 ? '' : 's'}. Kito is pleased.`, 'success');
      navigate(`/app?date=${meal.date}`);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const ai = status.data;

  return (
    <div className="stack-lg">
      <div>
        <h1>Point, review, save.</h1>
        <p className="muted small" style={{ marginTop: 4 }}>
          A photo gives us a first guess. You confirm every item and portion before it counts.
        </p>
      </div>

      {status.loading ? <Loading label="Checking photo analysis…" /> : null}
      {status.error ? <ErrorState message={status.error} onRetry={status.reload} /> : null}

      {ai && !ai.configured ? (
        <Card className="card-pad stack">
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', flex: 'none' }}>
              <Icon name="camera" />
            </span>
            <div>
              <h2>Photo analysis isn’t configured</h2>
              <p className="small muted" style={{ marginTop: 4 }}>{ai.message}</p>
            </div>
          </div>
          <div className="card-inset stack-sm">
            <strong className="small">To enable it on this server</strong>
            <ol className="small muted" style={{ paddingLeft: 20, display: 'grid', gap: 4 }}>
              <li>Set <code>AI_PROVIDER=openai</code>, <code>gemini</code> or <code>anthropic</code> in <code>.env</code>.</li>
              <li>Add the matching API key (<code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code>).</li>
              <li>Restart the API server and reload this page.</li>
            </ol>
            <p className="tiny muted">Keys are used only server-side and never reach the browser.</p>
          </div>
          <div className="row wrap">
            <Link to="/app/log" className="btn btn-primary btn-sm">Log manually instead</Link>
            <a className="btn btn-sm" href="/api/ai/status" target="_blank" rel="noreferrer">View server status</a>
          </div>
        </Card>
      ) : null}

      {ai?.configured ? (
        <>
          <Card className="card-pad stack">
            <div className="row-between">
              <h2>Meal photo</h2>
              <span className="pill pill-green">{ai.provider} · {ai.model}</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              id="meal-photo-input"
              onChange={(event) => void pickFile(event.target.files?.[0])}
            />
            <div className={`photo-drop ${image ? 'has-image' : ''}`}>
              {image ? (
                <img src={image} alt="Meal to analyse" />
              ) : (
                <>
                  <Icon name="camera" size={36} />
                  <div>
                    <strong>Take a photo or choose one</strong>
                    <p className="tiny">
                      JPEG, PNG or WebP, up to 15 MB. Your photo is resized in the browser and isn’t stored on the server.
                    </p>
                  </div>
                  <Button variant="primary" icon="camera" onClick={() => fileRef.current?.click()}>
                    Choose a photo
                  </Button>
                </>
              )}
            </div>
            {image ? (
              <div className="row wrap">
                <Button variant="primary" icon="sparkles" loading={analyzing} onClick={() => void analyze()}>
                  Analyse this photo
                </Button>
                <Button variant="ghost" onClick={() => fileRef.current?.click()}>Replace photo</Button>
                <Button variant="ghost" icon="close" onClick={reset}>Remove</Button>
              </div>
            ) : null}
            {imageError ? <div className="form-error" role="alert">{imageError}</div> : null}
            {analysisError ? (
              <div className="form-error" role="alert">
                {analysisError}
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void analyze()}>Try again</button>
                  <Link to="/app/log" className="btn btn-sm btn-ghost">Log manually</Link>
                </div>
              </div>
            ) : null}
            {analyzing ? (
              <div className="loading-inline" role="status">
                <span className="spinner" aria-hidden="true" /> Looking closely at the plate. Usually 5–15 seconds…
              </div>
            ) : null}
          </Card>

          {analysis ? (
            <div className="stack">
              <Card className="card-pad stack">
                <div className="row-between wrap" style={{ gap: 12 }}>
                  <div>
                    <p className="eyebrow">Photo estimate</p>
                    <h2 style={{ marginTop: 4 }}>{analysis.dish_name}</h2>
                  </div>
                  <ProgressRing
                    value={totals.kcal}
                    max={Math.max(totals.kcal, session?.goals?.calories ?? totals.kcal, 1)}
                    label="Estimated calories for this meal"
                    center={totals.kcal}
                    sub="kcal estimate"
                    size={104}
                  />
                </div>
                <p className="analysis-note">{analysis.observation}</p>
                {analysis.clarifying_question ? (
                  <div className="card-inset">
                    <strong className="small">Kito asks</strong>
                    <p className="small">{analysis.clarifying_question}</p>
                    <p className="tiny muted">Answer by renaming items or editing portions below.</p>
                  </div>
                ) : null}
                {analysis.warnings.map((warning) => (
                  <p key={warning} className="tiny muted">{warning}</p>
                ))}
                <div className="row wrap">
                  <span className="pill">Provider: {analysis.provider}</span>
                  <span className="pill">{Math.round(analysis.latency_ms / 100) / 10}s</span>
                  <span className="pill pill-amber">Estimate, not a measurement</span>
                </div>
              </Card>

              <Card className="card-pad stack">
                <div className="row-between">
                  <h2>Review each component</h2>
                  <span className="pill">{items.length} items</span>
                </div>
                <div className="field-grid two">
                  <Field label="Meal" htmlFor="scan-meal">
                    <select id="scan-meal" className="select" value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
                      {MEAL_TYPES.map((type) => <option key={type} value={type}>{mealLabel(type)}</option>)}
                    </select>
                  </Field>
                  <Field label="Meal name" htmlFor="scan-title">
                    <input id="scan-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
                  </Field>
                </div>

                {items.map((item) => (
                  <div key={item.key} className="scan-item stack-sm">
                    <div className="row-between" style={{ gap: 8 }}>
                      <span className={`badge-source ${item.data_source}`}>{sourceLabel(item.data_source)}</span>
                      <div className="row" style={{ gap: 8 }}>
                        <span className={`confidence ${item.confidence >= 0.7 ? 'high' : item.confidence >= 0.45 ? 'medium' : 'low'}`}>
                          <i /> {Math.round(item.confidence * 100)}% ID
                        </span>
                        <span className={`confidence ${item.portion_uncertainty === 'low' ? 'high' : item.portion_uncertainty === 'medium' ? 'medium' : 'low'}`}>
                          <i /> {item.portion_uncertainty} portion
                        </span>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                          style={{ width: 32, height: 32 }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="field-grid two">
                      <Field label="Food name" htmlFor={`scan-name-${item.key}`}>
                        <input
                          id={`scan-name-${item.key}`}
                          className="input"
                          value={item.name}
                          onChange={(event) => updateItem(item.key, { name: event.target.value })}
                        />
                      </Field>
                      <Field label="Grams" htmlFor={`scan-grams-${item.key}`}>
                        <input
                          id={`scan-grams-${item.key}`}
                          className="input"
                          type="number"
                          inputMode="decimal"
                          min={1}
                          value={item.gramsInput}
                          onChange={(event) => updateItem(item.key, { gramsInput: event.target.value })}
                          aria-invalid={item.gramsInput === ''}
                        />
                      </Field>
                    </div>
                    {item.matched_food_name ? (
                      <p className="tiny muted">
                        Matched to catalog: <strong>{item.matched_food_name}</strong>. Nutrition follows the catalog value for this weight.
                      </p>
                    ) : (
                      <p className="tiny muted">No catalog match — nutrition is the model’s estimate. Edit anything that looks wrong.</p>
                    )}
                    <div className="macro-grid" style={{ marginTop: 0 }}>
                      {([
                        ['kcal', 'Calories', 0],
                        ['protein', 'Protein (g)', 1],
                        ['carbs', 'Carbs (g)', 1],
                        ['fat', 'Fat (g)', 1],
                      ] as Array<[keyof NutritionFacts, string, number]>).map(([field, label, digits]) => (
                        <div key={field} className="field">
                          <label className="tiny" htmlFor={`scan-${field}-${item.key}`}>{label}</label>
                          <input
                            id={`scan-${field}-${item.key}`}
                            className="input"
                            style={{ minHeight: 38, padding: '6px 8px' }}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={digits === 1 ? '0.1' : '1'}
                            disabled={Boolean(item.per100g)}
                            value={Number(item.per100g ? item.nutrition[field] ?? 0 : item.nutrition[field] ?? 0).toFixed(digits)}
                            onChange={(event) => editNutrition(item.key, field, event.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <Button variant="secondary" icon="plus" onClick={() => setAddOpen(true)}>Add a component</Button>

                <div className="card-inset row-between wrap">
                  <div>
                    <strong className="mono" style={{ fontSize: '1.4rem' }}>{totals.kcal} kcal</strong>
                    <div className="tiny muted">
                      {totals.protein} g protein · {totals.carbs} g carbs · {totals.fat} g fat
                    </div>
                  </div>
                  <span className="pill pill-amber">Check portions</span>
                </div>
                {saveError ? <div className="form-error" role="alert">{saveError}</div> : null}
                <div className="row wrap">
                  <Button variant="primary" loading={saving} onClick={() => void save()} disabled={items.length === 0}>
                    Save reviewed meal
                  </Button>
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                </div>
                <p className="tiny muted">
                  Confidence and portion uncertainty are kept with the meal so the estimate never pretends to be a measurement.
                </p>
              </Card>
            </div>
          ) : null}
        </>
      ) : null}

      {addOpen ? (
        <Modal
          title="Add a component"
          onClose={() => setAddOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const grams = Number(newItem.grams);
                  if (!newItem.name.trim() || !Number.isFinite(grams) || grams <= 0) return;
                  const nutrition = {
                    kcal: Number(newItem.kcal) || 0,
                    protein: Number(newItem.protein) || 0,
                    carbs: Number(newItem.carbs) || 0,
                    fat: Number(newItem.fat) || 0,
                  };
                  setItems((current) => [
                    ...current,
                    {
                      key: `manual-${crypto.randomUUID()}`,
                      name: newItem.name.trim(),
                      local_name: null,
                      quantity: 1,
                      unit: 'g',
                      grams,
                      kcal: nutrition.kcal,
                      protein_g: nutrition.protein,
                      carbs_g: nutrition.carbs,
                      fat_g: nutrition.fat,
                      fiber_g: null,
                      confidence: 1,
                      portion_uncertainty: 'low',
                      ingredients: [],
                      data_source: 'user_entered',
                      matched_food_id: null,
                      matched_food_name: null,
                      nutrition,
                      per100g: grams > 0 ? scaleNutrition(nutrition, 100 / grams) : null,
                      gramsInput: String(grams),
                    },
                  ]);
                  setNewItem({ name: '', grams: '', kcal: '', protein: '', carbs: '', fat: '' });
                  setAddOpen(false);
                }}
              >
                Add component
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="Food name" htmlFor="add-name">
              <input id="add-name" className="input" value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
            </Field>
            <div className="field-grid two">
              {([
                ['grams', 'Grams'],
                ['kcal', 'Calories'],
                ['protein', 'Protein (g)'],
                ['carbs', 'Carbs (g)'],
                ['fat', 'Fat (g)'],
              ] as Array<[keyof typeof newItem, string]>).map(([key, label]) => (
                <Field key={key} label={label} htmlFor={`add-${key}`}>
                  <input
                    id={`add-${key}`}
                    className="input"
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={newItem[key]}
                    onChange={(event) => setNewItem({ ...newItem, [key]: event.target.value })}
                  />
                </Field>
              ))}
            </div>
            <p className="hint">Values describe the portion you are adding. Confidence is marked as your own entry.</p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
