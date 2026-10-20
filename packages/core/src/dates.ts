/**
 * Timezone-aware date helpers.
 *
 * The product stores UTC instants for events and a user timezone in preferences.
 * A "day" always means the user's local calendar day in that timezone.
 * We avoid date libraries: Intl gives us the IANA database already available in
 * browsers and Node.
 */

export type DateKey = string; // YYYY-MM-DD in the user's timezone

const dateKeyFormatterCache = new Map<string, Intl.DateTimeFormat>();
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function dateKeyFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = dateKeyFormatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateKeyFormatterCache.set(tz, formatter);
  }
  return formatter;
}

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(tz, formatter);
  }
  return formatter;
}

/** YYYY-MM-DD for the given instant in the given timezone. */
export function localDateKey(date: Date, timeZone: string): DateKey {
  const parts = dateKeyFormatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayKey(timeZone: string, now: Date = new Date()): DateKey {
  return localDateKey(now, timeZone);
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function offsetMsAt(instant: number, timeZone: string): number {
  const date = new Date(instant);
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  // Intl has second precision; strip milliseconds before comparing.
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Convert a wall-clock date/time in `timeZone` to a UTC instant. */
export function zonedDateTimeToUtc(dateKey: DateKey, time: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const firstGuess = naive - offsetMsAt(naive, timeZone);
  const refined = naive - offsetMsAt(firstGuess, timeZone);
  return new Date(refined);
}

export function startOfLocalDayUtc(dateKey: DateKey, timeZone: string): Date {
  return zonedDateTimeToUtc(dateKey, '00:00', timeZone);
}

export function addDaysToDateKey(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Whole-day difference (b - a). */
export function dateKeyDiff(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function startOfLocalWeekUtc(now: Date, timeZone: string, weekStartsOn: 0 | 1 = 1): { weekStart: DateKey; today: DateKey } {
  const today = localDateKey(now, timeZone);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const shift = (weekday - weekStartsOn + 7) % 7;
  return { weekStart: addDaysToDateKey(today, -shift), today };
}

export function formatDateKey(key: DateKey, locale = 'en', options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function relativeDayLabel(key: DateKey, timeZone: string, locale = 'en'): string {
  const today = localDateKey(new Date(), timeZone);
  if (key === today) return 'Today';
  if (key === addDaysToDateKey(today, -1)) return 'Yesterday';
  if (key === addDaysToDateKey(today, 1)) return 'Tomorrow';
  return formatDateKey(key, locale);
}

/** Duration formatting for fasting timers: "16:04:32" or "16h 04m". */
export function formatDuration(ms: number, style: 'clock' | 'short' = 'short'): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (style === 'clock') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function toDateKeyUTC(date: Date): DateKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Inclusive list of date keys between two keys. */
export function dateKeyRange(start: DateKey, end: DateKey): DateKey[] {
  const keys: DateKey[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 1000) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }
  return keys;
}
