import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import type { Database } from './db.js';
import { unauthorized } from './http.js';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
export const SESSION_COOKIE = 'np_session';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, 'hex');
  try {
    const derived = await scrypt(password, salt, expected.length, { N: Number(nRaw), r: Number(rRaw), p: Number(pRaw) });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export interface SessionUser {
  id: string;
  email: string;
  email_verified_at: string | null;
  created_at: string;
  session_id: string;
}

export function createSession(db: Database, userId: string, ttlDays: number, userAgent?: string): string {
  const raw = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlDays * 86_400_000).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), userId, sha256(raw), expires, now.toISOString(), now.toISOString(), userAgent?.slice(0, 200) ?? null);
  return raw;
}

export function lookupSession(db: Database, raw: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.id, u.email, u.email_verified_at, u.created_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(sha256(raw)) as
    | { session_id: string; expires_at: string; last_seen_at: string; id: string; email: string; email_verified_at: string | null; created_at: string }
    | undefined;
  if (!row) return null;
  const now = Date.now();
  if (new Date(row.expires_at).getTime() <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  // Sliding session: refresh once per day to avoid a write on every request.
  if (now - new Date(row.last_seen_at).getTime() > 86_400_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      new Date(now).toISOString(),
      new Date(now + 30 * 86_400_000).toISOString(),
      row.session_id,
    );
  }
  return {
    id: row.id,
    email: row.email,
    email_verified_at: row.email_verified_at,
    created_at: row.created_at,
    session_id: row.session_id,
  };
}

export function destroySession(db: Database, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function destroyAllSessions(db: Database, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function requireUser(db: Database, request: FastifyRequest): SessionUser {
  const raw = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  if (!raw) throw unauthorized();
  const user = lookupSession(db, raw);
  if (!user) throw unauthorized('Your session has expired. Please sign in again.');
  return user;
}

export type TokenKind = 'verify_email' | 'reset_password';

export function issueAuthToken(
  db: Database,
  userId: string,
  kind: TokenKind,
  ttlMs: number,
): { token: string; expires_at: string } {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  ).run(crypto.randomUUID(), userId, kind, sha256(token), expires, now.toISOString());
  return { token, expires_at: expires };
}

export function consumeAuthToken(db: Database, token: string, kind: TokenKind): string | null {
  const row = db
    .prepare('SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND kind = ?')
    .get(sha256(token), kind) as { id: string; user_id: string; expires_at: string; used_at: string | null } | undefined;
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  const result = db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(new Date().toISOString(), row.id);
  if (result.changes !== 1) return null;
  return row.user_id;
}

/** Development-only email delivery. Production must wire a real provider. */
export function sendEmail(to: string, subject: string, link: string): void {
  console.info(`[email] to=${to} subject="${subject}" link=${link}`);
}
