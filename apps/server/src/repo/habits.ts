import type { Database } from '../db.js';
import { ApiError, newId, notFound } from '../http.js';
import { localDateKey, type ActivityEntry, type FastingSession, type HydrationEntry, type WeightEntry } from '@nutripals/core';

interface HydrationRow {
  id: string;
  local_date: string;
  amount_ml: number;
  logged_at: string;
}
interface WeightRow {
  id: string;
  local_date: string;
  weight_kg: number;
  note: string | null;
  logged_at: string;
}
interface FastingRow {
  id: string;
  plan: string;
  target_minutes: number;
  started_at: string;
  ended_at: string | null;
  status: FastingSession['status'];
}
interface ActivityRow {
  id: string;
  local_date: string;
  type: string;
  minutes: number;
  steps: number | null;
  kcal_burned: number | null;
  note: string | null;
  logged_at: string;
}

function mapHydration(row: HydrationRow): HydrationEntry {
  return { id: row.id, date: row.local_date, amount_ml: row.amount_ml, logged_at: row.logged_at };
}
function mapWeight(row: WeightRow): WeightEntry {
  return { id: row.id, date: row.local_date, weight_kg: row.weight_kg, note: row.note, logged_at: row.logged_at };
}
function mapActivity(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    date: row.local_date,
    type: row.type,
    minutes: row.minutes,
    steps: row.steps,
    kcal_burned: row.kcal_burned,
    note: row.note,
    logged_at: row.logged_at,
  };
}

export function mapFasting(row: FastingRow, now = Date.now()): FastingSession {
  const start = new Date(row.started_at).getTime();
  const end = row.ended_at ? new Date(row.ended_at).getTime() : null;
  const elapsedMs = Math.max(0, (end ?? now) - start);
  const elapsedMinutes = Math.round(elapsedMs / 60_000);
  return {
    id: row.id,
    plan: row.plan,
    target_minutes: row.target_minutes,
    started_at: row.started_at,
    ended_at: row.ended_at,
    status: row.status,
    elapsed_minutes: elapsedMinutes,
    progress: row.status === 'cancelled' ? 0 : Math.min(1, elapsedMs / (row.target_minutes * 60_000)),
  };
}

// ---------------------------------------------------------------- hydration

export function listHydration(db: Database, userId: string, date: string): HydrationEntry[] {
  const rows = db
    .prepare('SELECT * FROM hydration_entries WHERE user_id = ? AND local_date = ? ORDER BY logged_at ASC')
    .all(userId, date) as unknown as HydrationRow[];
  return rows.map(mapHydration);
}

export function listHydrationRange(db: Database, userId: string): HydrationEntry[] {
  const rows = db
    .prepare('SELECT * FROM hydration_entries WHERE user_id = ? ORDER BY logged_at DESC LIMIT 5000')
    .all(userId) as unknown as HydrationRow[];
  return rows.map(mapHydration);
}

export function hydrationTotal(db: Database, userId: string, date: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount_ml), 0) AS total FROM hydration_entries WHERE user_id = ? AND local_date = ?')
    .get(userId, date) as { total: number };
  return Number(row.total);
}

export function addHydration(
  db: Database,
  userId: string,
  timezone: string,
  input: { amount_ml: number; logged_at: string },
): HydrationEntry {
  const id = newId();
  const date = localDateKey(new Date(input.logged_at), timezone);
  db.prepare(
    'INSERT INTO hydration_entries (id, user_id, local_date, amount_ml, logged_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, date, input.amount_ml, input.logged_at, new Date().toISOString());
  const row = db.prepare('SELECT * FROM hydration_entries WHERE id = ? AND user_id = ?').get(id, userId) as unknown as HydrationRow;
  return mapHydration(row);
}

export function updateHydration(db: Database, userId: string, id: string, amountMl: number): HydrationEntry {
  const result = db
    .prepare('UPDATE hydration_entries SET amount_ml = ? WHERE id = ? AND user_id = ?')
    .run(amountMl, id, userId);
  if (result.changes === 0) throw notFound('Water entry not found');
  return mapHydration(db.prepare('SELECT * FROM hydration_entries WHERE id = ?').get(id) as unknown as HydrationRow);
}

export function deleteHydration(db: Database, userId: string, id: string): void {
  const result = db.prepare('DELETE FROM hydration_entries WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) throw notFound('Water entry not found');
}

// ------------------------------------------------------------------- weight

export function listWeight(
  db: Database,
  userId: string,
  range: { from?: string; to?: string; limit?: number },
): WeightEntry[] {
  const params: (string | number)[] = [userId];
  let where = 'user_id = ?';
  if (range.from) {
    where += ' AND local_date >= ?';
    params.push(range.from);
  }
  if (range.to) {
    where += ' AND local_date <= ?';
    params.push(range.to);
  }
  const limit = range.limit && range.limit > 0 ? Math.min(range.limit, 1000) : 400;
  const rows = db
    .prepare(`SELECT * FROM weight_entries WHERE ${where} ORDER BY logged_at ASC LIMIT ?`)
    .all(...params, limit) as unknown as WeightRow[];
  return rows.map(mapWeight);
}

export function latestWeight(db: Database, userId: string, onOrBefore?: string): WeightEntry | null {
  const row = (onOrBefore
    ? db
        .prepare('SELECT * FROM weight_entries WHERE user_id = ? AND local_date <= ? ORDER BY logged_at DESC LIMIT 1')
        .get(userId, onOrBefore)
    : db.prepare('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1').get(userId)) as
    | WeightRow
    | undefined;
  return row ? mapWeight(row) : null;
}

function syncProfileWeight(db: Database, userId: string): void {
  const latest = latestWeight(db, userId);
  db.prepare('UPDATE profiles SET weight_kg = ?, updated_at = ? WHERE user_id = ?').run(
    latest?.weight_kg ?? null,
    new Date().toISOString(),
    userId,
  );
}

export function addWeight(
  db: Database,
  userId: string,
  timezone: string,
  input: { weight_kg: number; logged_at: string; note?: string | null },
): WeightEntry {
  const id = newId();
  const date = localDateKey(new Date(input.logged_at), timezone);
  db.prepare(
    'INSERT INTO weight_entries (id, user_id, local_date, weight_kg, note, logged_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, userId, date, input.weight_kg, input.note ?? null, input.logged_at, new Date().toISOString());
  syncProfileWeight(db, userId);
  return mapWeight(db.prepare('SELECT * FROM weight_entries WHERE id = ? AND user_id = ?').get(id, userId) as unknown as WeightRow);
}

export function updateWeight(
  db: Database,
  userId: string,
  id: string,
  input: { weight_kg?: number; note?: string | null; logged_at?: string },
  timezone: string,
): WeightEntry {
  const existing = db.prepare('SELECT * FROM weight_entries WHERE id = ? AND user_id = ?').get(id, userId) as
    | WeightRow
    | undefined;
  if (!existing) throw notFound('Weight entry not found');
  const loggedAt = input.logged_at ?? existing.logged_at;
  db.prepare('UPDATE weight_entries SET weight_kg = ?, note = ?, logged_at = ?, local_date = ? WHERE id = ? AND user_id = ?').run(
    input.weight_kg ?? existing.weight_kg,
    input.note === undefined ? existing.note : input.note,
    loggedAt,
    localDateKey(new Date(loggedAt), timezone),
    id,
    userId,
  );
  syncProfileWeight(db, userId);
  return mapWeight(db.prepare('SELECT * FROM weight_entries WHERE id = ?').get(id) as unknown as WeightRow);
}

export function deleteWeight(db: Database, userId: string, id: string): void {
  const result = db.prepare('DELETE FROM weight_entries WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) throw notFound('Weight entry not found');
  syncProfileWeight(db, userId);
}

// ------------------------------------------------------------------ fasting

export function activeFast(db: Database, userId: string, now = Date.now()): FastingSession | null {
  const row = db
    .prepare("SELECT * FROM fasting_sessions WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
    .get(userId) as unknown as FastingRow | undefined;
  return row ? mapFasting(row, now) : null;
}

export function listFasting(db: Database, userId: string, limit = 30): FastingSession[] {
  const rows = db
    .prepare('SELECT * FROM fasting_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(userId, limit) as unknown as FastingRow[];
  return rows.map((row) => mapFasting(row));
}

export function startFast(
  db: Database,
  userId: string,
  input: { plan: string; target_minutes: number; started_at?: string },
): FastingSession {
  if (activeFast(db, userId)) throw new ApiError(409, 'FASTING_ACTIVE', 'A fasting session is already running.');
  const now = new Date();
  const startedAt = input.started_at ?? now.toISOString();
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) throw new ApiError(400, 'INVALID_TIME', 'Invalid start time.');
  if (started > now.getTime() + 5 * 60_000) throw new ApiError(400, 'INVALID_TIME', 'A fast cannot start in the future.');
  if (started < now.getTime() - 24 * 3600_000) {
    throw new ApiError(400, 'INVALID_TIME', 'A fast can only be backdated by up to 24 hours.');
  }
  const id = newId();
  db.prepare(
    `INSERT INTO fasting_sessions (id, user_id, plan, target_minutes, started_at, ended_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'active', ?, ?)`,
  ).run(id, userId, input.plan, input.target_minutes, startedAt, now.toISOString(), now.toISOString());
  return mapFasting(db.prepare('SELECT * FROM fasting_sessions WHERE id = ?').get(id) as unknown as FastingRow);
}

export function finishFast(db: Database, userId: string, id: string, cancel = false): FastingSession {
  const row = db.prepare('SELECT * FROM fasting_sessions WHERE id = ? AND user_id = ?').get(id, userId) as
    | FastingRow
    | undefined;
  if (!row) throw notFound('Fasting session not found');
  if (row.status !== 'active') throw new ApiError(409, 'FASTING_NOT_ACTIVE', 'This fasting session has already ended.');
  const now = new Date().toISOString();
  db.prepare('UPDATE fasting_sessions SET ended_at = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    now,
    cancel ? 'cancelled' : 'completed',
    now,
    id,
    userId,
  );
  return mapFasting(db.prepare('SELECT * FROM fasting_sessions WHERE id = ?').get(id) as unknown as FastingRow);
}

// ----------------------------------------------------------------- activity

export function listActivity(db: Database, userId: string, date?: string): ActivityEntry[] {
  const rows = (date
    ? db.prepare('SELECT * FROM activity_entries WHERE user_id = ? AND local_date = ? ORDER BY logged_at ASC').all(userId, date)
    : db.prepare('SELECT * FROM activity_entries WHERE user_id = ? ORDER BY logged_at DESC LIMIT 100').all(userId)) as unknown as ActivityRow[];
  return rows.map(mapActivity);
}

export function addActivity(
  db: Database,
  userId: string,
  timezone: string,
  input: {
    type: string;
    minutes: number;
    steps?: number | null;
    kcal_burned?: number | null;
    logged_at: string;
    note?: string | null;
  },
): ActivityEntry {
  const id = newId();
  const date = localDateKey(new Date(input.logged_at), timezone);
  db.prepare(
    `INSERT INTO activity_entries (id, user_id, local_date, type, minutes, steps, kcal_burned, note, logged_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    date,
    input.type,
    input.minutes,
    input.steps ?? null,
    input.kcal_burned ?? null,
    input.note ?? null,
    input.logged_at,
    new Date().toISOString(),
  );
  return mapActivity(db.prepare('SELECT * FROM activity_entries WHERE id = ? AND user_id = ?').get(id, userId) as unknown as ActivityRow);
}

export function deleteActivity(db: Database, userId: string, id: string): void {
  const result = db.prepare('DELETE FROM activity_entries WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) throw notFound('Activity entry not found');
}
