/**
 * ============================================================================
 *  🔑 resetToken.js — opaque, single-use password reset tokens
 * ============================================================================
 *  💡 The raw token is sent to the user (email in production, response body in
 *     development) and **only its SHA-256 hash is stored** in MongoDB. Leaking
 *     the database therefore does not leak usable reset tokens.
 * ============================================================================
 */
const crypto = require('crypto');

/** SHA-256 is enough here: the token already has 256 bits of entropy. */
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * @returns {{ token: string, hashedToken: string }} raw token + value to persist
 */
const createResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hashedToken: hashToken(token) };
};

module.exports = { createResetToken, hashToken };
