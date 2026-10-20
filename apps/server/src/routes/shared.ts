import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db.js';
import type { Config } from '../env.js';
import { ApiError, newId } from '../http.js';
import { SESSION_COOKIE, requireUser } from '../auth.js';
import {
  localDateKey,
  type SessionResponse,
} from '@nutripals/core';
import {
  getLatestGoals,
  getPreferences,
  getProfile,
  getUserById,
  rowToUser,
} from '../repo/users.js';
import { getCompanionState } from '../repo/insights.js';

export interface AppContext {
  db: Database;
  config: Config;
}

export function todayFor(userId: string, ctx: AppContext): string {
  const profile = getProfile(ctx.db, userId);
  return localDateKey(new Date(), profile.timezone);
}

export function sessionPayload(ctx: AppContext, userId: string): SessionResponse {
  const row = getUserById(ctx.db, userId);
  if (!row) throw new ApiError(401, 'UNAUTHORIZED', 'Account no longer exists.');
  const profile = getProfile(ctx.db, userId);
  const today = localDateKey(new Date(), profile.timezone);
  return {
    user: rowToUser(row),
    profile,
    preferences: getPreferences(ctx.db, userId),
    goals: getLatestGoals(ctx.db, userId),
    companion: getCompanionState(ctx.db, userId, today),
  };
}

export function currentUser(ctx: AppContext, request: FastifyRequest) {
  return requireUser(ctx.db, request);
}

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: ctx.config.cookieSameSite,
    secure: ctx.config.secureCookies,
    maxAge: ctx.config.sessionTtlDays * 86_400,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: ctx.config.cookieSameSite,
    secure: ctx.config.secureCookies,
  });
}

export function idempotencyKey(request: FastifyRequest): string | null {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be between 8 and 128 characters.');
  }
  return value;
}

/** Replay-safe write: identical keys return the original stored response. */
export function runIdempotent<T>(
  ctx: AppContext,
  request: FastifyRequest,
  userId: string,
  endpoint: string,
  handler: () => T,
): T {
  const key = idempotencyKey(request);
  if (!key) return handler();
  const existing = ctx.db
    .prepare('SELECT endpoint, response FROM idempotency_keys WHERE user_id = ? AND key = ?')
    .get(userId, key) as { endpoint: string; response: string } | undefined;
  if (existing) {
    if (existing.endpoint !== endpoint) {
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request.');
    }
    return JSON.parse(existing.response) as T;
  }
  const result = handler();
  ctx.db
    .prepare('INSERT INTO idempotency_keys (user_id, key, endpoint, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, key, endpoint, 200, JSON.stringify(result), new Date().toISOString());
  return result;
}

export function makeId(): string {
  return newId();
}
