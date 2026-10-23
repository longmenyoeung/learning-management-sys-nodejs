/**
 * ============================================================================
 *  🔐 authenticate — "who are you?"
 * ============================================================================
 *  Reads the `Authorization: Bearer <token>` header, verifies the JWT, loads the
 *  fresh user from MongoDB (so a deleted/deactivated account is rejected even
 *  if its token is still valid) and attaches it to `req.user`.
 *
 *  💡 `authenticateOptional` is used on public endpoints that behave slightly
 *     differently for logged-in users (course listing / course detail): it never
 *     fails, it just attaches `req.user` when a valid token is present.
 * ============================================================================
 */
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/generateToken');

/** Extract the raw token from the header, or return null. */
const extractToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
};

/** Load the user behind a token, validating account state. */
const resolveUser = async (token) => {
  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    // 💡 jsonwebtoken throws TokenExpiredError / JsonWebTokenError → both are 401.
    throw ApiError.unauthorized(
      error.name === 'TokenExpiredError'
        ? 'Your session has expired, please log in again'
        : 'Invalid authentication token'
    );
  }

  // 💡 `tokenVersion` is `select: false`, so it must be requested explicitly.
  const user = await User.findById(payload.id).select('+tokenVersion');
  if (!user) throw ApiError.unauthorized('The account linked to this token no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');

  // 💡 Revocation check: logout / password change / password reset bumps the
  //    counter, which invalidates every token signed with an older value.
  const tokenVersion = Number(payload.tv) || 0;
  if (tokenVersion !== (Number(user.tokenVersion) || 0)) {
    throw ApiError.unauthorized('Your session is no longer valid, please log in again');
  }

  return user;
};

/** Hard authentication — a missing/invalid token stops the request with 401. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authentication required: provide a Bearer token');
  }

  req.user = await resolveUser(token);
  req.token = token;
  return next();
});

/** Soft authentication — never throws, only fills `req.user` when possible. */
const authenticateOptional = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
      req.token = token;
    } catch (_error) {
      // 💡 A public endpoint must still work with a broken/expired token.
      req.user = undefined;
    }
  }
  return next();
});

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.authenticateOptional = authenticateOptional;
