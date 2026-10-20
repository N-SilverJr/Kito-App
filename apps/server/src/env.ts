import path from 'node:path';

export type AiProviderId = 'none' | 'openai' | 'gemini' | 'anthropic';

export interface Config {
  port: number;
  nodeEnv: string;
  appOrigin: string;
  allowedOrigins: string[];
  databasePath: string;
  migrationsDir: URL;
  secureCookies: boolean;
  exposeDevTokens: boolean;
  serveWeb: boolean;
  webDistPath: string;
  sessionTtlDays: number;
  aiProvider: AiProviderId;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  enableOpenFoodFacts: boolean;
  offBaseUrl: string;
  offUserAgent: string;
  usdaApiKey: string;
  rateLimitMax: number;
  authRateLimitMax: number;
  aiHourlyLimit: number;
  /** Injection points for tests / alternate transports. */
  aiFetch?: typeof fetch;
  foodFetch?: typeof fetch;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  const provider = (env.AI_PROVIDER ?? 'none').toLowerCase();
  const aiProvider: AiProviderId =
    provider === 'openai' || provider === 'gemini' || provider === 'anthropic' ? provider : 'none';
  const databasePath = env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'nutripals.db');

  const config: Config = {
    port: num(env.PORT, 8787),
    nodeEnv: env.NODE_ENV ?? 'development',
    appOrigin: env.APP_ORIGIN ?? 'http://localhost:5173',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:8787')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databasePath,
    migrationsDir: MIGRATIONS_DIR,
    secureCookies: bool(env.SESSION_COOKIE_SECURE, env.NODE_ENV === 'production'),
    exposeDevTokens: bool(env.EXPOSE_DEV_TOKENS, env.NODE_ENV !== 'production'),
    serveWeb: bool(env.SERVE_WEB, env.NODE_ENV === 'production'),
    webDistPath: env.WEB_DIST_PATH ?? path.resolve(process.cwd(), '..', 'web', 'dist'),
    sessionTtlDays: 30,
    aiProvider,
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiModel: env.OPENAI_MODEL ?? 'gpt-4o-mini',
    geminiApiKey: env.GEMINI_API_KEY ?? '',
    geminiModel: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
    enableOpenFoodFacts: bool(env.ENABLE_OPEN_FOOD_FACTS, true),
    offBaseUrl: (env.OPEN_FOOD_FACTS_BASE_URL ?? 'https://world.openfoodfacts.org').replace(/\/$/, ''),
    offUserAgent: env.OFF_USER_AGENT ?? 'NutriPals/0.1 (development)',
    usdaApiKey: env.USDA_FDC_API_KEY ?? '',
    rateLimitMax: num(env.RATE_LIMIT_MAX, 300),
    authRateLimitMax: num(env.AUTH_RATE_LIMIT_MAX, 20),
    aiHourlyLimit: num(env.AI_RATE_LIMIT_MAX, 30),
  };
  return { ...config, ...overrides };
}

export function aiCredential(config: Config): { configured: boolean; model: string | null; message: string } {
  if (config.aiProvider === 'openai' && config.openaiApiKey) {
    return { configured: true, model: config.openaiModel, message: 'OpenAI-compatible vision model configured.' };
  }
  if (config.aiProvider === 'gemini' && config.geminiApiKey) {
    return { configured: true, model: config.geminiModel, message: 'Gemini vision model configured.' };
  }
  if (config.aiProvider === 'anthropic' && config.anthropicApiKey) {
    return { configured: true, model: config.anthropicModel, message: 'Anthropic vision model configured.' };
  }
  if (config.aiProvider === 'none') {
    return {
      configured: false,
      model: null,
      message:
        'Photo analysis is not configured on this server. Set AI_PROVIDER and the matching API key (see .env.example). Manual search and logging work fully.',
    };
  }
  return {
    configured: false,
    model: null,
    message: `AI_PROVIDER=${config.aiProvider} is selected but its API key is missing. Add it to .env and restart the server.`,
  };
}
