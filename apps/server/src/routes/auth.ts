import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  guessTimeZone,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  localDateKey,
} from '@nutripals/core';
import {
  consumeAuthToken,
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  issueAuthToken,
  lookupSession,
  sendEmail,
  verifyPassword,
} from '../auth.js';
import { getUserByEmail, getUserById, createUser, updateProfileFields } from '../repo/users.js';
import { ApiError, parseWith } from '../http.js';
import { clearSessionCookie, currentUser, sessionPayload, setSessionCookie, type AppContext } from './shared.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  const authLimit = { config: { rateLimit: { max: ctx.config.authRateLimitMax, timeWindow: '1 minute' } } };

  function verificationLink(token: string): string {
    return `${ctx.config.appOrigin}/verify-email?token=${encodeURIComponent(token)}`;
  }
  function resetLink(token: string): string {
    return `${ctx.config.appOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  }

  app.post('/api/auth/register', authLimit, async (request, reply: FastifyReply) => {
    const input = parseWith(registerSchema, request.body);
    if (getUserByEmail(ctx.db, input.email)) {
      throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    }
    const timezone = input.timezone ?? guessTimeZone();
    const user = createUser(ctx.db, {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      displayName: input.display_name ?? input.email.split('@')[0] ?? 'Friend',
      timezone,
    });
    const token = issueAuthToken(ctx.db, user.id, 'verify_email', 24 * 3_600_000);
    sendEmail(user.email, 'Verify your NutriPals email', verificationLink(token.token));
    const session = createSession(ctx.db, user.id, ctx.config.sessionTtlDays, request.headers['user-agent']);
    setSessionCookie(ctx, reply, session);
    reply.status(201);
    return {
      user: { id: user.id, email: user.email, email_verified: false, created_at: user.created_at },
      verification_required: true,
      ...(ctx.config.exposeDevTokens ? { dev_verification_token: token.token } : {}),
    };
  });

  app.post('/api/auth/login', authLimit, async (request, reply: FastifyReply) => {
    const input = parseWith(loginSchema, request.body);
    const user = getUserByEmail(ctx.db, input.email);
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const token = createSession(ctx.db, user.id, ctx.config.sessionTtlDays, request.headers['user-agent']);
    setSessionCookie(ctx, reply, token);
    return { user: { id: user.id, email: user.email, email_verified: Boolean(user.email_verified_at), created_at: user.created_at } };
  });

  app.post('/api/auth/logout', async (request, reply: FastifyReply) => {
    const raw = (request.cookies as Record<string, string | undefined>)['np_session'];
    if (raw) {
      const session = lookupSession(ctx.db, raw);
      if (session) destroySession(ctx.db, session.session_id);
    }
    clearSessionCookie(ctx, reply);
    return { ok: true as const };
  });

  app.get('/api/auth/session', async (request) => {
    const user = currentUser(ctx, request);
    return sessionPayload(ctx, user.id);
  });

  app.post('/api/auth/verify-email', authLimit, async (request) => {
    const input = parseWith(verifyEmailSchema, request.body);
    const userId = consumeAuthToken(ctx.db, input.token, 'verify_email');
    if (!userId) throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired.');
    ctx.db.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      new Date().toISOString(),
      userId,
    );
    return { verified: true as const };
  });

  app.post('/api/auth/resend-verification', authLimit, async (request) => {
    const user = currentUser(ctx, request);
    const row = getUserById(ctx.db, user.id);
    if (!row) throw new ApiError(401, 'UNAUTHORIZED', 'Account not found.');
    if (row.email_verified_at) return { ok: true as const };
    const token = issueAuthToken(ctx.db, user.id, 'verify_email', 24 * 3_600_000);
    sendEmail(row.email, 'Verify your NutriPals email', verificationLink(token.token));
    return { ok: true as const, ...(ctx.config.exposeDevTokens ? { dev_verification_token: token.token } : {}) };
  });

  app.post('/api/auth/forgot-password', authLimit, async (request) => {
    const input = parseWith(forgotPasswordSchema, request.body);
    const user = getUserByEmail(ctx.db, input.email);
    if (user) {
      const token = issueAuthToken(ctx.db, user.id, 'reset_password', 60 * 60_000);
      sendEmail(user.email, 'Reset your NutriPals password', resetLink(token.token));
      return { ok: true as const, ...(ctx.config.exposeDevTokens ? { dev_reset_token: token.token } : {}) };
    }
    // Same response shape to avoid account enumeration.
    return { ok: true as const };
  });

  app.post('/api/auth/reset-password', authLimit, async (request) => {
    const input = parseWith(resetPasswordSchema, request.body);
    const userId = consumeAuthToken(ctx.db, input.token, 'reset_password');
    if (!userId) throw new ApiError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired.');
    const now = new Date().toISOString();
    ctx.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      await hashPassword(input.password),
      now,
      userId,
    );
    destroyAllSessions(ctx.db, userId);
    return { ok: true as const };
  });

  app.post('/api/auth/change-password', async (request) => {
    const user = currentUser(ctx, request);
    const input = parseWith(changePasswordSchema, request.body);
    const row = getUserById(ctx.db, user.id);
    if (!row) throw new ApiError(401, 'UNAUTHORIZED', 'Account not found.');
    if (!(await verifyPassword(input.current_password, row.password_hash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }
    ctx.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      await hashPassword(input.new_password),
      new Date().toISOString(),
      user.id,
    );
    ctx.db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(user.id, user.session_id);
    return { ok: true as const };
  });

  // Refresh the stored timezone when the device moves; affects future day keys only.
  app.post('/api/auth/timezone', async (request) => {
    const user = currentUser(ctx, request);
    const body = request.body as { timezone?: unknown };
    if (typeof body?.timezone !== 'string' || body.timezone.length > 64) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid timezone is required.');
    }
    const { isValidTimeZone } = await import('@nutripals/core');
    if (!isValidTimeZone(body.timezone)) throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown timezone.');
    updateProfileFields(ctx.db, user.id, { timezone: body.timezone });
    const profile = sessionPayload(ctx, user.id).profile;
    return { timezone: profile.timezone, today: localDateKey(new Date(), profile.timezone) };
  });
}
