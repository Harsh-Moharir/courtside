import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-for-unit-tests-only',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    },
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/domain/**', 'src/lib/color.ts', 'src/lib/export/csv.ts', 'src/lib/export/ics.ts', 'src/lib/import/**'],
      thresholds: { lines: 90 },
    },
  },
});
