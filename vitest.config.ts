import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: {
      concurrent: false
    }
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
      $routes: path.resolve(__dirname, 'src/routes')
    }
  }
});
