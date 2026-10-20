import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // These tests use a real SQLite database and real HTTP injection. The first
    // test in a cold run also pays module-load and migration costs, which can
    // exceed the 5s default on slower machines, so allow more headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
