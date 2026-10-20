import { beforeEach, describe, expect, it } from 'vitest';
import type { ReminderPreferences } from '@nutripals/core';
import { dueReminders, inQuietHours } from './notifications';

function baseReminders(): ReminderPreferences {
  return {
    meals: { enabled: true, time: '12:30', days: [0, 1, 2, 3, 4, 5, 6] },
    water: { enabled: true, start: '09:00', end: '18:00', every_minutes: 60 },
    weight: { enabled: true, time: '07:00', days: [1] },
    fasting: { enabled: false },
    quiet_hours: { enabled: true, start: '22:00', end: '07:00' },
  };
}

describe('quiet hours', () => {
  it('detects a window that crosses midnight', () => {
    const reminders = baseReminders();
    expect(inQuietHours(reminders, new Date('2026-05-04T23:15:00'))).toBe(true);
    expect(inQuietHours(reminders, new Date('2026-05-04T03:00:00'))).toBe(true);
    expect(inQuietHours(reminders, new Date('2026-05-04T12:00:00'))).toBe(false);
  });

  it('never suppresses when disabled', () => {
    const reminders = { ...baseReminders(), quiet_hours: { enabled: false, start: '22:00', end: '07:00' } };
    expect(inQuietHours(reminders, new Date('2026-05-04T23:15:00'))).toBe(false);
  });
});

describe('dueReminders', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fires a meal reminder only at the configured minute', () => {
    const reminders = baseReminders();
    const atTime = dueReminders(reminders, new Date('2026-05-04T12:30:00'), '2026-05-04');
    expect(atTime.map((hit) => hit.kind)).toContain('meals');
    const other = dueReminders(reminders, new Date('2026-05-04T12:31:00'), '2026-05-04');
    expect(other.map((hit) => hit.kind)).not.toContain('meals');
  });

  it('never fires inside quiet hours, even if a reminder is due', () => {
    const reminders = { ...baseReminders(), meals: { ...baseReminders().meals, time: '23:00' } };
    expect(dueReminders(reminders, new Date('2026-05-04T23:00:00'), '2026-05-04')).toHaveLength(0);
  });

  it('fires water reminders only on the interval inside the window', () => {
    const reminders = baseReminders();
    const inside = dueReminders(reminders, new Date('2026-05-04T09:00:00'), '2026-05-04');
    expect(inside.map((hit) => hit.kind)).toContain('water');
    const offInterval = dueReminders(reminders, new Date('2026-05-04T09:30:00'), '2026-05-04');
    expect(offInterval.map((hit) => hit.kind)).not.toContain('water');
    const afterWindow = dueReminders(reminders, new Date('2026-05-04T18:00:00'), '2026-05-04');
    expect(afterWindow.map((hit) => hit.kind)).not.toContain('water');
  });

  it('respects the selected weekdays', () => {
    const reminders = baseReminders();
    // 2026-05-04 is a Monday (weight reminder enabled), 2026-05-05 is a Tuesday.
    expect(dueReminders(reminders, new Date('2026-05-04T07:00:00'), '2026-05-04').map((hit) => hit.kind)).toContain('weight');
    expect(dueReminders(reminders, new Date('2026-05-05T07:00:00'), '2026-05-05').map((hit) => hit.kind)).not.toContain('weight');
  });

  it('returns an empty list when every reminder is disabled', () => {
    const reminders = baseReminders();
    const disabled: ReminderPreferences = {
      ...reminders,
      meals: { ...reminders.meals, enabled: false },
      water: { ...reminders.water, enabled: false },
      weight: { ...reminders.weight, enabled: false },
    };
    expect(dueReminders(disabled, new Date('2026-05-04T12:30:00'), '2026-05-04')).toHaveLength(0);
  });
});
