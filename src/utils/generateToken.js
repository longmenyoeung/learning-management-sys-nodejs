/**
 * ============================================================================
 *  🔐 generateToken — JWT helpers
 * ============================================================================
 *  💡 The payload only contains the user id + role: small token, and the role
 *     is still re-checked against the database inside `authenticate` (a role
 *     change in the database takes effect immediately unless you trust the token).
 *  💡 Environment variables are read at call time (not at import time) so tests
 *     and scripts can override them.
 * ============================================================================
 */
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');
const { JWT_ALGORITHM } = require('../config/security');

/** Resolve the signing secret (supports both SECRET_JWT and JWT_SECRET names). */
const getSecret = () => getJwtSecret();

/** Kept configurable, but the defaults are deliberately short-lived. */
const getSignOptions = () => ({
  algorithm: JWT_ALGORITHM,
  // 💡 2 hours by default: token revocation (tokenVersion) covers logout and
  //    password changes, and a short TTL bounds the damage of a stolen token.
  expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  issuer: process.env.JWT_ISSUER || 'lms-api',
  audience: process.env.JWT_AUDIENCE || 'lms-client',
});

/**
 * Sign an access token for a user document.
 * @param {object} user - Mongoose user document (needs _id + role + tokenVersion)
 * @returns {string} signed JWT
 */
const generateToken = (user) =>
  jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      // 💡 Token version → lets the API revoke tokens without a session store.
      tv: Number(user.tokenVersion) || 0,
    },
    getSecret(),
    getSignOptions()
  );

/**
 * Verify a token and return its payload. Throws `JsonWebTokenError` /
 * `TokenExpiredError` which `errorHandler` converts into a 401.
 * 💡 `algorithms` is pinned: without it a token could be verified with any
 *    algorithm the library supports (e.g. `none` in old versions, or a
 *    confusion attack between HS/RS families).
 * @param {string} token
 */
const verifyToken = (token) =>
  jwt.verify(token, getSecret(), {
    algorithms: [JWT_ALGORITHM],
    issuer: process.env.JWT_ISSUER || 'lms-api',
    audience: process.env.JWT_AUDIENCE || 'lms-client',
  });

module.exports = { generateToken, verifyToken, getSecret };
