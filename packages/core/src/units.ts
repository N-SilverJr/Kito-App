/**
 * Unit conversion helpers. Storage is always canonical:
 * grams, millilitres, kilograms, centimetres, kilocalories, Celsius-independent.
 * Conversions are display-only and must never rewrite stored measurements.
 */

export type UnitSystem = 'metric' | 'imperial';

export const GRAMS_PER_LB = 453.59237;
export const CM_PER_INCH = 2.54;
export const ML_PER_FL_OZ = 29.5735295625;

export function kgToLb(kg: number): number {
  return kg / 0.45359237;
}

export function lbToKg(lb: number): number {
  return lb * 0.45359237;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_INCH;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

export function mlToFlOz(ml: number): number {
  return ml / ML_PER_FL_OZ;
}

export function flOzToMl(flOz: number): number {
  return flOz * ML_PER_FL_OZ;
}

/** Round for display without changing stored values. */
export function displayWeight(kg: number, system: UnitSystem): { value: number; unit: 'kg' | 'lb' } {
  return system === 'metric' ? { value: Math.round(kg * 10) / 10, unit: 'kg' } : { value: Math.round(kgToLb(kg) * 10) / 10, unit: 'lb' };
}

export function displayHeight(cm: number, system: UnitSystem): { value: number; unit: 'cm' | 'in' } {
  return system === 'metric' ? { value: Math.round(cm), unit: 'cm' } : { value: Math.round(cmToIn(cm) * 10) / 10, unit: 'in' };
}

export function displayVolume(ml: number, system: UnitSystem): { value: number; unit: 'ml' | 'fl oz' } {
  return system === 'metric' ? { value: Math.round(ml), unit: 'ml' } : { value: Math.round(mlToFlOz(ml) * 10) / 10, unit: 'fl oz' };
}

/** Convert a user-entered weight to canonical kg, with range validation. */
export function weightInputToKg(value: number, system: UnitSystem): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Weight must be a positive number');
  const kg = system === 'imperial' ? lbToKg(value) : value;
  if (kg < 20 || kg > 400) throw new Error('Weight is outside the supported range (20–400 kg)');
  return Math.round(kg * 100) / 100;
}

export function volumeInputToMl(value: number, system: UnitSystem): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Volume must be a positive number');
  const ml = system === 'imperial' ? flOzToMl(value) : value;
  if (ml < 10 || ml > 5000) throw new Error('Volume is outside the supported range');
  return Math.round(ml);
}

export interface ServingSize {
  unit: string;
  grams: number;
  /** True when the gram weight is a household approximation rather than measured. */
  approximate?: boolean;
  is_default?: boolean;
}

export type GramResolution =
  | { grams: number; approximate: boolean; note?: string }
  | { grams: null; reason: string };

/**
 * Resolve quantity + unit to grams. Returns grams: null when we cannot make a
 * defensible conversion — callers must then ask the user for a gram weight
 * rather than inventing one.
 */
export function resolveGrams(
  quantity: number,
  unit: string,
  servingSizes: readonly ServingSize[],
  densityGPerMl?: number,
): GramResolution {
  if (!Number.isFinite(quantity) || quantity <= 0) return { grams: null, reason: 'Quantity must be greater than zero' };
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') {
    return { grams: Math.round(quantity * 10) / 10, approximate: false };
  }
  if (normalized === 'kg') return { grams: Math.round(quantity * 1000), approximate: false };
  if (normalized === 'ml') {
    if (densityGPerMl && densityGPerMl > 0) {
      return { grams: Math.round(quantity * densityGPerMl * 10) / 10, approximate: true, note: 'Converted using an approximate density' };
    }
    return { grams: null, reason: 'This food has no known density; enter grams instead' };
  }
  const serving = servingSizes.find((s) => s.unit.trim().toLowerCase() === normalized);
  if (serving) {
    return {
      grams: Math.round(quantity * serving.grams * 10) / 10,
      approximate: serving.approximate === true,
      note: serving.approximate ? 'Household portion — gram weight is approximate' : undefined,
    };
  }
  return { grams: null, reason: `No gram conversion is known for “${unit}” — enter the weight in grams` };
}

export const COMMON_SERVING_UNITS = ['g', 'ml', 'piece', 'cup', 'tbsp', 'tsp', 'slice', 'bowl', 'plate'] as const;

/** Local-time-clock independent formatter for weights. */
export function formatWeight(kg: number, system: UnitSystem): string {
  const { value, unit } = displayWeight(kg, system);
  return `${value} ${unit}`;
}

export function formatHeight(cm: number, system: UnitSystem): string {
  const { value, unit } = displayHeight(cm, system);
  return `${value} ${unit}`;
}
