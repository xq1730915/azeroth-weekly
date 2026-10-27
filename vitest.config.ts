import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', maxWorkers: 1, testTimeout: 20000 },
});
