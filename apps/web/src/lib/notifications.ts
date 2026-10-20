import type { ReminderPreferences } from '@nutripals/core';

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationSupport;
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  const result = await Notification.requestPermission();
  return result as NotificationSupport;
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function minutesOfDay(value: string): number | null {
  const parsed = parseTime(value);
  return parsed ? parsed.hours * 60 + parsed.minutes : null;
}

export function inQuietHours(reminders: ReminderPreferences, now: Date): boolean {
  if (!reminders.quiet_hours.enabled) return false;
  const start = minutesOfDay(reminders.quiet_hours.start);
  const end = minutesOfDay(reminders.quiet_hours.end);
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export interface ReminderHit {
  kind: 'meals' | 'water' | 'weight';
  title: string;
  body: string;
}

const firedKey = 'nutripals-reminders-fired';

function firedToday(kind: string, dayKey: string): boolean {
  try {
    const raw = localStorage.getItem(firedKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed[kind] === dayKey;
  } catch {
    return false;
  }
}

function markFired(kind: string, dayKey: string): void {
  try {
    const raw = localStorage.getItem(firedKey);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[kind] = dayKey;
    localStorage.setItem(firedKey, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

/** Which reminders are due at this exact minute, respecting quiet hours and once-per-day rules. */
export function dueReminders(reminders: ReminderPreferences, now: Date, dayKey: string): ReminderHit[] {
  if (inQuietHours(reminders, now)) return [];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const weekday = now.getDay();
  const hits: ReminderHit[] = [];

  if (reminders.meals.enabled && reminders.meals.days.includes(weekday)) {
    const target = minutesOfDay(reminders.meals.time);
    if (target !== null && target === minutes && !firedToday('meals', dayKey)) {
      hits.push({ kind: 'meals', title: 'A gentle nudge from Kito', body: 'If you ate, this is a good moment to log it. No pressure.' });
    }
  }

  if (reminders.water.enabled) {
    const start = minutesOfDay(reminders.water.start);
    const end = minutesOfDay(reminders.water.end);
    if (start !== null && end !== null && minutes >= start && minutes < end) {
      const every = reminders.water.every_minutes;
      if ((minutes - start) % every === 0 && !firedToday(`water-${minutes}`, dayKey)) {
        hits.push({ kind: 'water', title: 'Water check-in', body: 'Thirsty? A glass of water is a good idea if so.' });
      }
    }
  }

  if (reminders.weight.enabled && reminders.weight.days.includes(weekday)) {
    const target = minutesOfDay(reminders.weight.time);
    if (target !== null && target === minutes && !firedToday('weight', dayKey)) {
      hits.push({ kind: 'weight', title: 'Optional check-in', body: 'Log a weight entry if you find the trend useful. Skipping is fine too.' });
    }
  }

  return hits;
}

/**
 * Reminder loop. Browser notifications only fire while a NutriPals tab is open;
 * true background push needs a server scheduler. The UI states this plainly.
 */
export function startReminderLoop(
  getReminders: () => ReminderPreferences,
  getDayKey: () => string,
  onScheduled?: () => void,
): () => void {
  let stopped = false;
  const check = () => {
    if (stopped || notificationSupport() !== 'granted') return;
    const reminders = getReminders();
    const dayKey = getDayKey();
    for (const hit of dueReminders(reminders, new Date(), dayKey)) {
      try {
        new Notification(hit.title, { body: hit.body, icon: '/icon-192.png', tag: `nutripals-${hit.kind}` });
        const dedupeKey = hit.kind === 'water' ? `water-${new Date().getHours() * 60 + new Date().getMinutes()}` : hit.kind;
        markFired(dedupeKey, dayKey);
        onScheduled?.();
      } catch {
        // Notification construction can fail in some embedded browsers.
      }
    }
  };
  const interval = window.setInterval(check, 30_000);
  check();
  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}
