/**
 * ============================================================================
 *  🚦 rateLimit.js — throttling for the whole API + stricter auth limits
 * ============================================================================
 *  💡 Two layers:
 *      • `apiLimiter`  → broad protection against scraping / floods
 *      • `authLimiter` → brute-force protection for login, register and the
 *                        password reset flow (bcrypt is CPU expensive, so an
 *                        unlimited login endpoint is also a DoS vector)
 *
 *  Environment variables (all optional):
 *      RATE_LIMIT_WINDOW_MS   default 900000 (15 min)
 *      RATE_LIMIT_MAX         default 300 requests / window / IP
 *      AUTH_RATE_LIMIT_MAX    default 10 failed attempts / window / IP
 *
 *  💡 Rate limiting is disabled while NODE_ENV=test so the integration suite
 *     can make hundreds of requests. Set RATE_LIMIT_ENABLED=true to test it.
 * ============================================================================
 */
const rateLimit = require('express-rate-limit');
const { intFromEnv } = require('../config/env');

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/** Disabled in tests unless explicitly enabled. */
const skipInTests = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_ENABLED !== 'true';

/**
 * Create a JSON rate limiter.
 * @param {object} [options]
 * @param {number} [options.windowMs]
 * @param {number} [options.limit]
 * @param {string} [options.message]
 * @param {boolean} [options.skipSuccessfulRequests]
 * @param {() => boolean} [options.skip]
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    limit = 300,
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
    skip = skipInTests,
    ...rest
  } = options;

  return rateLimit({
    windowMs,
    limit,
    skip,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message },
    ...rest,
  });
};

/** Broad limiter mounted on /api. */
const apiLimiter = createRateLimiter({
  windowMs: intFromEnv('RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  limit: intFromEnv('RATE_LIMIT_MAX', 300),
  message: 'Too many requests. Please slow down and try again later.',
});

/**
 * Strict limiter for authentication endpoints.
 * 💡 `skipSuccessfulRequests` means only *failed* attempts count, so a user
 *    who logs in normally is never locked out by their own activity.
 */
const authLimiter = createRateLimiter({
  windowMs: intFromEnv('AUTH_RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  limit: intFromEnv('AUTH_RATE_LIMIT_MAX', 10),
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts. Please try again in a few minutes.',
});

module.exports = { createRateLimiter, apiLimiter, authLimiter };
