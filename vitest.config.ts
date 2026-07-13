import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/tests/**/*.test.ts'],
    // The admin side is React/browser code and is covered by the typecheck only.
    exclude: ['node_modules', 'dist'],
  },
});
