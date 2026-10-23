import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration
 * ---------------------------------------------------------------------------
 * 💡 `fileParallelism: false` + `maxWorkers: 1` keep every test file in a single
 *    worker: the integration tests share one real MongoDB database and must not
 *    run on top of each other.
 * 💡 `sequence.hooks: 'list'` is **essential**: by default Vitest runs hooks in
 *    parallel, so the global `beforeEach` that wipes the database would race with
 *    the `beforeEach` of a test file that creates its fixtures.
 * 💡 The timeouts are generous because the suite talks to MongoDB Atlas.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // exposes describe/it/expect without importing them
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    sequence: {
      hooks: 'list', // run beforeAll/beforeEach/afterEach hooks in declaration order
      concurrent: false, // tests inside a file run one after the other
    },
    hookTimeout: 60000,
    testTimeout: 30000,
    reporters: 'default',
  },
});

