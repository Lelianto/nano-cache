import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
      exclude: [
        'docs/**',
        'examples/**',
        'dist/**',
        'coverage/**',
        '**/*.d.ts',
        // Config & non-runtime files
        '.eslintrc.cjs',
        'tsup.config.ts',
        'vitest.config.ts',
        // Type-only modules have no executable statements
        'src/types/**',
        // IndexedDB adapter requires a real browser IDB environment; tested
        // functionally via its graceful memory fallback in happy-dom
        'src/adapters/indexeddb.ts',
      ],
    },
  },
});
