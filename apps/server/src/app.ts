import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { openDatabase, type Database } from './db.js';
import { loadConfig, type Config } from './env.js';
import { ApiError, safeErrorBody } from './http.js';
import { seedCatalog } from './seed/foods.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerNutritionRoutes } from './routes/nutrition.js';
import { registerHabitRoutes } from './routes/habits.js';
import { registerInsightRoutes } from './routes/insights.js';

export interface BuildAppOptions {
  config?: Partial<Config>;
  database?: Database;
}

export interface BuiltApp {
  app: FastifyInstance;
  db: Database;
  config: Config;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), geolocation=(), microphone=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export async function buildApp(options: BuildAppOptions = {}): Promise<BuiltApp> {
  const config = loadConfig(options.config);
  const db = options.database ?? openDatabase(config.databasePath, config.migrationsDir);
  seedCatalog(db);

  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: config.nodeEnv === 'production' ? 'info' : 'debug',
            redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          },
    bodyLimit: 1_500_000,
    trustProxy: config.nodeEnv === 'production',
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' } }),
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to make requests.');
    }
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
      reply.header('Access-Control-Max-Age', '600');
      return reply.status(204).send();
    }
    return undefined;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) reply.header(header, value);
    if (!reply.getHeader('Content-Security-Policy') && !request.url.startsWith('/api/')) {
      reply.header('Content-Security-Policy', CSP);
    }
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const { status, body } = safeErrorBody(error, String(request.id));
    if (status >= 500) request.log.error({ err: error }, 'request failed');
    else request.log.debug({ err: error instanceof Error ? error.message : 'request rejected' }, 'request rejected');
    reply.status(status).send(body);
  });

  const ctx = { db, config };
  registerAuthRoutes(app, ctx);
  registerMeRoutes(app, ctx);
  registerNutritionRoutes(app, ctx);
  registerHabitRoutes(app, ctx);
  registerInsightRoutes(app, ctx);

  const distPath = path.resolve(config.webDistPath);
  if (config.serveWeb && existsSync(path.join(distPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      setHeaders: (response, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
          response.setHeader('Cache-Control', 'no-cache');
        }
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
        return;
      }
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
        return;
      }
      reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'API is running, but no web build is being served. Use the Vite dev server or set SERVE_WEB=true.',
        },
      });
    });
  }

  app.addHook('onClose', async () => {
    if (!options.database) db.close();
  });

  await app.ready();
  return { app, db, config };
}
