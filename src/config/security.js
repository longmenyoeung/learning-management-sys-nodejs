/**
 * ============================================================================
 *  🔒 security.js — shared security constants
 * ============================================================================
 *  💡 One source of truth for the password policy and the token lifetimes.
 *     The Mongoose schema, the express-validator chains and the password reset
 *     flow all read these values, so they can never drift apart.
 * ============================================================================
 */

/** Minimum length of a user password (enforced by the API *and* the schema). */
const PASSWORD_MIN_LENGTH = 10;

/** bcrypt only uses the first 72 bytes → longer passwords are silently truncated. */
const PASSWORD_MAX_LENGTH = 72;

/** Password reset tokens are short lived (15 minutes). */
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

/** Default cost factor for bcrypt when BCRYPT_SALT_ROUNDS is not set. */
const BCRYPT_ROUNDS_DEFAULT = 10;

/** The only JWT algorithm this API signs and accepts. */
const JWT_ALGORITHM = 'HS256';

/** Recommended minimum length for the JWT secret (256 bits of base64url ≈ 43 chars). */
const JWT_SECRET_MIN_LENGTH = 32;

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RESET_TTL_MS,
  BCRYPT_ROUNDS_DEFAULT,
  JWT_ALGORITHM,
  JWT_SECRET_MIN_LENGTH,
};
