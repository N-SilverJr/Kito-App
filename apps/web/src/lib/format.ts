import {
  MEAL_TYPE_LABELS,
  addDaysToDateKey,
  displayHeight,
  displayVolume,
  displayWeight,
  formatDateKey,
  guessTimeZone,
  localDateKey,
  mlToFlOz,
  cmToIn,
  kgToLb,
  type MealType,
  type UnitSystem,
} from '@nutripals/core';

export function userTimezone(preferencesTimezone?: string | null): string {
  return preferencesTimezone || guessTimeZone();
}

export function todayKey(timezone?: string | null, now = new Date()): string {
  return localDateKey(now, userTimezone(timezone));
}

export function shiftDay(key: string, days: number): string {
  return addDaysToDateKey(key, days);
}

export function prettyDate(key: string, opts?: Intl.DateTimeFormatOptions): string {
  return formatDateKey(key, 'en', opts ?? { weekday: 'short', day: 'numeric', month: 'short' });
}

export function prettyDateLong(key: string): string {
  return formatDateKey(key, 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeOfDay(iso: string, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: userTimezone(timezone) }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

export function mealLabel(type: string): string {
  return MEAL_TYPE_LABELS[type as MealType] ?? type;
}

export function kcal(value: number): string {
  return new Intl.NumberFormat('en').format(Math.round(value));
}

export function grams(value: number): string {
  return `${Math.round(value)} g`;
}

export function weightText(kg: number, system: UnitSystem): string {
  const { value, unit } = displayWeight(kg, system);
  return `${value.toLocaleString('en', { maximumFractionDigits: 1 })} ${unit}`;
}

export function heightText(cm: number, system: UnitSystem): string {
  const { value, unit } = displayHeight(cm, system);
  return `${value} ${unit}`;
}

export function volumeText(ml: number, system: UnitSystem): string {
  const { value, unit } = displayVolume(ml, system);
  return `${value.toLocaleString('en', { maximumFractionDigits: 1 })} ${unit}`;
}

export function volumeInputValue(ml: number, system: UnitSystem): number {
  return system === 'imperial' ? Math.round(mlToFlOz(ml) * 10) / 10 : ml;
}

export function weightInputValue(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10;
}

export function heightInputValue(cm: number, system: UnitSystem): number {
  return system === 'imperial' ? Math.round(cmToIn(cm) * 10) / 10 : Math.round(cm);
}

export function percent(value: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, (value / target) * 100));
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function initial(name: string): string {
  return (name.trim()[0] ?? 'N').toUpperCase();
}

export function greeting(timezone?: string | null): string {
  let hour = new Date().getHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone: userTimezone(timezone) }).format(new Date()),
    );
  } catch {
    // fall back to device hour
  }
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'catalog':
      return 'Food catalog';
    case 'open_food_facts':
      return 'Open Food Facts';
    case 'usda_fdc':
      return 'USDA FoodData Central';
    case 'ai_estimate':
      return 'AI estimate';
    default:
      return 'Entered by you';
  }
}
