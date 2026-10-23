/**
 * ============================================================================
 *  🧪 tests/setup.js — global test setup (Vitest `setupFiles`)
 * ============================================================================
 *  💡 The integration tests run against a **real MongoDB** but in an isolated
 *     database (`DB_NAME_TEST`, default `lms_api_test`) so development data is
 *     never touched.
 *  💡 The suite runs sequentially (see vitest.config.js).
 *  ⚠️ Cleanup between tests is **not** done here: a hook declared in a setup file
 *     can run in parallel with a hook of the same type declared in a test file,
 *     which would wipe the fixtures of the running test. Each test file therefore
 *     calls `resetDatabase()` from `./helpers.js` at the top of its own
 *     `beforeEach` (file-level hooks always run before describe-level hooks).
 *
 *  Want an offline database? Install `mongodb-memory-server` and run:
 *      npm i -D mongodb-memory-server
 *      $env:USE_MEMORY_DB="true"; npm test     # PowerShell
 * ============================================================================
 */
import { beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import dbModule from '../src/config/db.js';

const { connectDB, disconnectDB } = dbModule;

dotenv.config();

let memoryServer = null;

beforeAll(async () => {
  if (process.env.USE_MEMORY_DB === 'true') {
    // 💡 Optional in-memory MongoDB: `npm i -D mongodb-memory-server`
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      await mongoose.connect(memoryServer.getUri(), { dbName: 'lms_api_test' });
      console.log('🧪 Using mongodb-memory-server');
    } catch (error) {
      throw new Error(
        `USE_MEMORY_DB=true but "mongodb-memory-server" is not available (${error.message}).\n` +
          'Install it with `npm i -D mongodb-memory-server`, or unset USE_MEMORY_DB to run against a real MongoDB.'
      );
    }
  } else {
    await connectDB('test'); // ← connects to DB_NAME_TEST
  }

  // 💡 Drop everything once (also removes stale indexes from earlier runs).
  await mongoose.connection.dropDatabase();
}, 60000);

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
  if (memoryServer) await memoryServer.stop();
});

