import type { Database } from '../db.js';
import { json } from '../db.js';
import { aiCredential, type Config } from '../env.js';
import { ApiError, newId } from '../http.js';
import { searchLocalFoods } from '../repo/meals.js';
import {
  aiAnalysisSchema,
  macroDrift,
  scaleNutrition,
  type AiAnalysis,
  type AiAnalysisItem,
  type AiStatus,
  type AnalyzeResponse,
  type AnalyzedItem,
  type Food,
} from '@nutripals/core';

const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are a careful nutrition estimation assistant for a food-logging app used in Rwanda and East Africa.
Analyse the meal photo and identify each distinct food component separately (for example ubugari, beans, isombe and sauce on one plate must be separate items).

Return ONLY a JSON object with this exact shape:
{
  "dish_name": "short name for the whole meal",
  "items": [
    {
      "name": "food name in English",
      "local_name": "Kinyarwanda or local name if you recognise it, else null",
      "quantity": 1,
      "unit": "piece|cup|bowl|plate|slice|g",
      "grams": 150,
      "kcal": 195,
      "protein_g": 4.0,
      "carbs_g": 42.0,
      "fat_g": 0.5,
      "fiber_g": 0.6,
      "confidence": 0.7,
      "portion_uncertainty": "low|medium|high",
      "ingredients": ["optional visible ingredients"]
    }
  ],
  "observation": "one short, neutral sentence about the estimate",
  "clarifying_question": "a question if a food or portion is unclear, else null"
}

Rules:
- Nutrition values describe the visible portion, not 100 g.
- Estimate grams whenever possible. If you cannot estimate a weight, set grams to null and use a household unit.
- confidence is 0..1 for the food identification. portion_uncertainty reflects how sure you are about the amount.
- Never invent foods that are not visible. If unsure, use a generic name and low confidence.
- Use common regional foods when they match (ubugari/ugali, isombe, ibishyima/beans, matoke, chapati, mandazi, ikivuguto, tilapia, sweet potato, greens).
- Do not give medical, dieting or weight-loss advice. Keep the observation non-judgmental.
- Return JSON only, no markdown fences, no extra text.`;

export function getAiStatus(config: Config): AiStatus {
  const credentials = aiCredential(config);
  return {
    configured: credentials.configured,
    provider: credentials.configured ? (config.aiProvider as AiStatus['provider']) : config.aiProvider,
    model: credentials.model,
    message: credentials.message,
  };
}

interface ParsedImage {
  mimeType: string;
  base64: string;
}

function parseImage(image: string): ParsedImage {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match || !match[1] || !match[2]) {
    throw new ApiError(400, 'INVALID_IMAGE', 'Upload a JPEG, PNG or WebP image.');
  }
  const bytes = Math.floor((match[2].length * 3) / 4);
  if (bytes > 6_000_000) throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Please use an image smaller than 6 MB.');
  if (bytes < 1000) throw new ApiError(400, 'INVALID_IMAGE', 'That image looks empty. Try another photo.');
  return { mimeType: match[1], base64: match[2] };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in model response');
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function callOpenAi(config: Config, image: ParsedImage, repair: string | null): Promise<string> {
  const fetchImpl = config.aiFetch ?? fetch;
  const userText = repair ? `${SYSTEM_PROMPT}\n\nPrevious output was invalid (${repair}). Return valid JSON only.` : SYSTEM_PROMPT;
  const response = await fetchImpl(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You return only valid JSON. You never give medical advice.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: 'low' } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenAI responded ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content;
}

async function callGemini(config: Config, image: ParsedImage, repair: string | null): Promise<string> {
  const fetchImpl = config.aiFetch ?? fetch;
  const text = repair ? `${SYSTEM_PROMPT}\n\nPrevious output was invalid (${repair}). Return valid JSON only.` : SYSTEM_PROMPT;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`Gemini responded ${response.status}`);
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!content) throw new Error('Empty response from Gemini');
  return content;
}

async function callAnthropic(config: Config, image: ParsedImage, repair: string | null): Promise<string> {
  const fetchImpl = config.aiFetch ?? fetch;
  const text = repair ? `${SYSTEM_PROMPT}\n\nPrevious output was invalid (${repair}). Return valid JSON only.` : SYSTEM_PROMPT;
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 1400,
      temperature: 0.2,
      system: 'You return only valid JSON. You never give medical advice.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } },
            { type: 'text', text },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Anthropic responded ${response.status}`);
  const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const content = payload.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('');
  if (!content) throw new Error('Empty response from Anthropic');
  return content;
}

function callProvider(config: Config, image: ParsedImage, repair: string | null): Promise<string> {
  if (config.aiProvider === 'openai') return callOpenAi(config, image, repair);
  if (config.aiProvider === 'gemini') return callGemini(config, image, repair);
  if (config.aiProvider === 'anthropic') return callAnthropic(config, image, repair);
  throw new ApiError(503, 'AI_NOT_CONFIGURED', 'Photo analysis is not configured on this server.');
}

function matchFood(db: Database, userId: string, item: AiAnalysisItem): Food | null {
  const candidates = searchLocalFoods(db, userId, item.name, 5);
  const target = item.name.trim().toLowerCase();
  for (const food of candidates) {
    const names = [food.name, ...food.alt_names].map((name) => name.toLowerCase());
    if (names.some((name) => name === target || name.includes(target) || target.includes(name))) return food;
  }
  return null;
}

function normalizeAnalysis(db: Database, userId: string, analysis: AiAnalysis): { items: AnalyzedItem[]; warnings: string[] } {
  const warnings: string[] = [];
  let lowConfidence = 0;
  let inconsistent = 0;
  const items: AnalyzedItem[] = analysis.items.map((item) => {
    const food = matchFood(db, userId, item);
    const grams = item.grams ?? null;
    let finalItem: AnalyzedItem = {
      ...item,
      grams,
      data_source: 'ai_estimate',
      matched_food_id: food?.id ?? null,
      matched_food_name: food?.name ?? null,
    };
    if (food && grams) {
      const scaled = scaleNutrition(food.per_100g, grams);
      finalItem = {
        ...finalItem,
        kcal: Math.round(scaled.kcal),
        protein_g: Math.round(scaled.protein * 10) / 10,
        carbs_g: Math.round(scaled.carbs * 10) / 10,
        fat_g: Math.round(scaled.fat * 10) / 10,
        fiber_g: scaled.fiber === undefined ? null : Math.round(scaled.fiber * 10) / 10,
        data_source: food.source === 'catalog' ? 'catalog' : 'user_entered',
        confidence: Math.max(item.confidence, 0.6),
      };
    } else if (food && !grams) {
      warnings.push(`“${food.name}” was recognised, but the portion weight is missing. Add grams before saving.`);
    }
    if (finalItem.confidence < 0.5) lowConfidence += 1;
    if (macroDrift(finalItem.kcal, finalItem.protein_g, finalItem.carbs_g, finalItem.fat_g) > 0.4) inconsistent += 1;
    return finalItem;
  });
  if (lowConfidence > 0) {
    warnings.push(`${lowConfidence} item${lowConfidence === 1 ? '' : 's'} had low identification confidence. Check the names and portions.`);
  }
  if (inconsistent > 0) {
    warnings.push('Some calorie and macronutrient values do not line up closely. Photo estimates are approximate.');
  }
  warnings.push('Nutrition from a photo is an estimate, not a laboratory measurement.');
  return { items, warnings };
}

export async function analyzeFoodImage(
  config: Config,
  db: Database,
  userId: string,
  image: string,
  today: string,
): Promise<AnalyzeResponse> {
  const status = getAiStatus(config);
  if (!status.configured) throw new ApiError(503, 'AI_NOT_CONFIGURED', status.message);
  const parsedImage = parseImage(image);

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const usage = db
    .prepare('SELECT COUNT(*) AS count FROM ai_analyses WHERE user_id = ? AND created_at >= ?')
    .get(userId, hourAgo) as { count: number };
  if (Number(usage.count) >= config.aiHourlyLimit) {
    throw new ApiError(429, 'AI_RATE_LIMITED', 'You have reached the photo-analysis limit for this hour. Try again later.');
  }

  const started = Date.now();
  let analysis: AiAnalysis | null = null;
  let repair: string | null = null;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await callProvider(config, parsedImage, repair);
      const candidate = extractJson(text);
      const parsed = aiAnalysisSchema.safeParse(candidate);
      if (!parsed.success) {
        repair = parsed.error.issues[0]?.message ?? 'schema mismatch';
        continue;
      }
      analysis = parsed.data;
      break;
    } catch (error) {
      lastError = error as Error;
      if (error instanceof ApiError) throw error;
      repair = 'request failed';
    }
  }
  const latency = Date.now() - started;

  if (!analysis) {
    db.prepare(
      `INSERT INTO ai_analyses (id, user_id, provider, model, status, item_count, latency_ms, error_code, result, created_at)
       VALUES (?, ?, ?, ?, 'failed', 0, ?, ?, NULL, ?)`,
    ).run(newId(), userId, config.aiProvider, status.model ?? '', latency, 'INVALID_RESPONSE', new Date().toISOString());
    const isTimeout = lastError?.name === 'TimeoutError' || /timeout/i.test(lastError?.message ?? '');
    if (isTimeout) throw new ApiError(504, 'AI_TIMEOUT', 'The photo took too long to analyse. Please try again.');
    throw new ApiError(
      502,
      'AI_INVALID_RESPONSE',
      'The food analysis service returned an unusable result. Please try again or log the meal manually.',
    );
  }

  const { items, warnings } = normalizeAnalysis(db, userId, analysis);
  const analysisId = newId();
  const now = new Date().toISOString();
  const response: Omit<AnalyzeResponse, 'analysis_id'> = {
    dish_name: analysis.dish_name,
    items,
    observation: analysis.observation || 'Estimated from the photo.',
    clarifying_question: analysis.clarifying_question ?? null,
    provider: config.aiProvider,
    model: status.model ?? '',
    warnings,
    latency_ms: latency,
  };
  db.prepare(
    `INSERT INTO ai_analyses (id, user_id, provider, model, status, item_count, latency_ms, error_code, result, created_at)
     VALUES (?, ?, ?, ?, 'succeeded', ?, ?, NULL, ?, ?)`,
  ).run(
    analysisId,
    userId,
    config.aiProvider,
    status.model ?? '',
    items.length,
    latency,
    JSON.stringify({ ...response, local_date: today }),
    now,
  );
  return { analysis_id: analysisId, ...response };
}

export function getAnalysis(db: Database, userId: string, analysisId: string): unknown | null {
  const row = db
    .prepare('SELECT result FROM ai_analyses WHERE id = ? AND user_id = ?')
    .get(analysisId, userId) as { result: string | null } | undefined;
  return row ? json<unknown>(row.result, null) : null;
}
