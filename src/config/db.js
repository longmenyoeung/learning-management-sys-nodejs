/**
 * ============================================================================
 *  🗄️  MongoDB connection (Mongoose)
 * ============================================================================
 *  💡 We keep the connection logic in one place so both the API (`server.js`)
 *     and the test setup can reuse it.
 *  💡 Resolution order: `MONGODB_URI_TEST` (only for NODE_ENV=test) →
 *     `MONGODB_URI` → `MONGODB_ATLAS`, so a local database can be used without
 *     touching the Atlas credentials.
 * ============================================================================
 */
const mongoose = require('mongoose');

/**
 * Resolve the connection string + database name from the environment.
 * @param {string} [env] - `test` switches to the isolated test database.
 */
const resolveConfig = (env = process.env.NODE_ENV) => {
  const isTest = env === 'test';

  // 💡 MONGODB_URI_TEST lets the test suite run against a *local* mongod
  //    (much faster than the network), e.g. mongodb://127.0.0.1:27017
  const uri =
    (isTest && process.env.MONGODB_URI_TEST) ||
    process.env.MONGODB_URI ||
    process.env.MONGODB_ATLAS;

  // ⚠️ Tests must never write to the development database, so they get their own db name.
  const dbName = isTest
    ? process.env.DB_NAME_TEST || 'lms_api_test'
    : process.env.DB_NAME || 'lms_api';

  return { uri, dbName };
};

/**
 * Connect to MongoDB.
 * @param {string} [env] - override NODE_ENV (used by the test setup).
 * @param {{ dbName?: string }} [options] - override the database name (used by the seed script).
 * @returns {Promise<import('mongoose').Connection>}
 */
const connectDB = async (env = process.env.NODE_ENV, options = {}) => {
  const { uri, dbName } = resolveConfig(env);

  if (!uri) {
    // 💡 Fail fast with an actionable message instead of a cryptic Mongoose error.
    throw new Error(
      '❌ MongoDB connection string is missing. Set MONGODB_URI (or MONGODB_ATLAS) in your .env file.'
    );
  }

  // ⚠️ `strictQuery` keeps unexpected query keys from leaking into MongoDB.
  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(uri, {
    dbName: options.dbName || dbName,
    // Fail fast when the cluster is unreachable (Atlas DNS / IP allow-list problems)
    serverSelectionTimeoutMS: 15000,
    // 💡 Index creation: in production prefer `autoIndex: false` + migrations.
    autoIndex: env !== 'production',
  });

  console.log(`✅ MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);

  // 💡 Connection events are logged so silent disconnects are easy to spot.
  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err.message));

  return conn;
};

/**
 * Close the connection (used by the test teardown and graceful shutdown).
 */
const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.resolveConfig = resolveConfig;
