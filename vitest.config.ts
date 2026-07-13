import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/tests/**/*.test.ts', 'admin/tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
