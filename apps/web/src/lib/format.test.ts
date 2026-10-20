import { describe, expect, it } from 'vitest';
import {
  greeting,
  heightInputValue,
  heightText,
  mealLabel,
  percent,
  shiftDay,
  sourceLabel,
  todayKey,
  volumeInputValue,
  volumeText,
  weightInputValue,
  weightText,
} from './format';

describe('date helpers', () => {
  it('derives the local day key in the requested timezone', () => {
    // 2026-03-01T23:30Z is already 2026-03-02 in Kigali (UTC+2).
    const instant = new Date('2026-03-01T23:30:00.000Z');
    expect(todayKey('Africa/Kigali', instant)).toBe('2026-03-02');
    expect(todayKey('UTC', instant)).toBe('2026-03-01');
    expect(todayKey('America/Los_Angeles', instant)).toBe('2026-03-01');
  });

  it('shifts days across month boundaries', () => {
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('greets according to local time', () => {
    expect(greeting()).toMatch(/^Good (morning|afternoon|evening)$/);
  });
});

describe('unit display', () => {
  it('formats weight in both systems', () => {
    expect(weightText(70, 'metric')).toBe('70 kg');
    expect(weightText(70, 'imperial')).toBe('154.3 lb');
  });

  it('formats volume in both systems', () => {
    expect(volumeText(2000, 'metric')).toBe('2,000 ml');
    expect(volumeText(1000, 'imperial')).toBe('33.8 fl oz');
  });

  it('formats height in both systems', () => {
    expect(heightText(175, 'metric')).toBe('175 cm');
    expect(heightText(175, 'imperial')).toContain('in');
  });

  it('converts metric values into imperial input values and back', () => {
    const pounds = weightInputValue(70, 'imperial');
    expect(pounds).toBeCloseTo(154.3, 1);
    expect(weightInputValue(70, 'metric')).toBe(70);

    const inches = heightInputValue(180, 'imperial');
    expect(inches).toBeCloseTo(70.9, 1);

    const flOz = volumeInputValue(500, 'imperial');
    expect(flOz).toBeCloseTo(16.9, 1);
    expect(volumeInputValue(500, 'metric')).toBe(500);
  });
});

describe('labels and percentages', () => {
  it('maps meal types to labels', () => {
    expect(mealLabel('breakfast')).toBe('Breakfast');
    expect(mealLabel('custom-brunch')).toBe('custom-brunch');
  });

  it('labels nutrition data sources', () => {
    expect(sourceLabel('catalog')).toBe('Food catalog');
    expect(sourceLabel('open_food_facts')).toBe('Open Food Facts');
    expect(sourceLabel('usda_fdc')).toBe('USDA FoodData Central');
    expect(sourceLabel('ai_estimate')).toBe('AI estimate');
    expect(sourceLabel('user_entered')).toBe('Entered by you');
  });

  it('clamps percentages and handles zero targets', () => {
    expect(percent(50, 100)).toBe(50);
    expect(percent(250, 100)).toBe(100);
    expect(percent(30, 0)).toBe(0);
  });
});
