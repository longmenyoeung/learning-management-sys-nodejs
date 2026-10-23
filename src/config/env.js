/**
 * ============================================================================
 *  🧪 env.js — environment helpers + fail-fast configuration checks
 * ============================================================================
 *  💡 `validateEnv()` runs once at boot (see server.js). It never prints secret
 *     values — only the *names* of the variables that need attention.
 *
 *  Rules:
 *    • production → missing MongoDB URI / weak JWT secret are fatal
 *    • development → the same problems are loud warnings (DX first)
 *    • test → only warnings, so an offline/in-memory test database still works
 * ============================================================================
 */
const { JWT_SECRET_MIN_LENGTH } = require('./security');

const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'change-me-to-a-long-random-string',
  'secret',
  'your-secret',
  'jwt-secret',
]);

/** @returns {boolean} */
const isProduction = () => process.env.NODE_ENV === 'production';

/** @returns {boolean} */
const isTest = () => process.env.NODE_ENV === 'test';

/**
 * The JWT signing secret (supports both SECRET_JWT and JWT_SECRET).
 * @throws {Error} when no secret is configured
 */
const getJwtSecret = () => {
  const secret = process.env.SECRET_JWT || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('❌ JWT secret is missing. Set SECRET_JWT in your .env file.');
  }
  return secret;
};

/** Resolve the MongoDB connection string exactly like `connectDB()` does. */
const resolveMongoUri = () =>
  (isTest() && process.env.MONGODB_URI_TEST) ||
  process.env.MONGODB_URI ||
  process.env.MONGODB_ATLAS;

/**
 * Parse a positive integer environment variable.
 * @param {string} name
 * @param {number} fallback
 */
const intFromEnv = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Validate the environment and fail fast on dangerous production settings.
 * @param {{ exitOnError?: boolean }} [options] - `exitOnError: false` throws instead of exiting
 * @returns {{ errors: string[], warnings: string[] }}
 */
const validateEnv = ({ exitOnError = true } = {}) => {
  const errors = [];
  const warnings = [];
  const production = isProduction();

  // ── Database ──────────────────────────────────────────────────────────────
  if (!resolveMongoUri()) {
    const message = 'MongoDB connection string is missing (MONGODB_URI or MONGODB_ATLAS).';
    if (isTest()) warnings.push(message);
    else errors.push(message);
  }

  // ── JWT secret ────────────────────────────────────────────────────────────
  const secret = process.env.SECRET_JWT || process.env.JWT_SECRET;
  if (!secret) {
    errors.push('SECRET_JWT is missing — tokens cannot be signed or verified.');
  } else {
    if (PLACEHOLDER_SECRETS.has(secret)) {
      const message =
        'SECRET_JWT still contains the example placeholder. Generate a random secret before deploying.';
      if (production) errors.push(message);
      else warnings.push(message);
    }
    if (secret.length < JWT_SECRET_MIN_LENGTH) {
      const message = `SECRET_JWT is shorter than ${JWT_SECRET_MIN_LENGTH} characters. Use at least 256 bits of entropy (e.g. \`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"\`).`;
      if (production) errors.push(message);
      else warnings.push(message);
    }
  }

  // ── Reverse proxy / HTTPS ─────────────────────────────────────────────────
  if (production) {
    if (!process.env.TRUST_PROXY) {
      warnings.push(
        'TRUST_PROXY is not set. Behind a load balancer set it to the number of proxy hops (usually 1) so rate limiting and HTTPS detection see the real client IP.'
      );
    }
    if (!process.env.CORS_ORIGINS) {
      warnings.push(
        'CORS_ORIGINS is not set — browser requests from a different origin will be refused in production.'
      );
    }
    if (process.env.ENABLE_SWAGGER === 'true') {
      warnings.push('ENABLE_SWAGGER=true exposes the API documentation in production.');
    }
  } else if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV is not set; defaulting to development behaviour.');
  }

  warnings.forEach((warning) => console.warn(`⚠️  ${warning}`));

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`❌ ${error}`));
    if (production) {
      const error = new Error(
        `Invalid environment configuration:\n  - ${errors.join('\n  - ')}\nSee .env.example and SECURITY.md.`
      );
      if (!exitOnError) throw error;
      process.exit(1);
    }
  }

  return { errors, warnings };
};

module.exports = {
  isProduction,
  isTest,
  getJwtSecret,
  resolveMongoUri,
  intFromEnv,
  validateEnv,
};
