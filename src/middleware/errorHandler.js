/**
 * ============================================================================
 *  🚨 errorHandler — the single place where errors become HTTP responses
 * ============================================================================
 *  Every error (thrown ApiError, Mongoose error, JWT error, unexpected bug)
 *  ends up here because `asyncHandler` forwards it with `next(error)`.
 *
 *  Status code map used by this API:
 *     400 Bad Request          – malformed input (bad ObjectId, bad JSON, ...)
 *     401 Unauthorized         – not logged in / bad or expired token
 *     403 Forbidden            – logged in, but not allowed (role / ownership)
 *     404 Not Found            – resource does not exist
 *     409 Conflict             – duplicate (email, enrollment, review, ...)
 *     422 Validation Error     – express-validator / Mongoose validation
 *     500 Internal Server Error – unexpected bug
 * ============================================================================
 */
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

/** Message returned for every unexpected 5xx in production (no internals leak). */
const GENERIC_SERVER_ERROR = 'Something went wrong on the server. Please try again later.';

const isProduction = () => process.env.NODE_ENV === 'production';

/** Map a raw error to `{ statusCode, message, errors }`. */
const normalizeError = (err) => {
  const production = isProduction();

  // ── 1. Our own ApiError (already carries the status code) ─────────────────
  if (err instanceof ApiError || err.name === 'ApiError') {
    const statusCode = err.statusCode || 500;
    return {
      statusCode,
      // 💡 A 5xx ApiError may contain internal details → generic in production.
      message: statusCode >= 500 && production ? GENERIC_SERVER_ERROR : err.message,
      errors: statusCode >= 500 ? [] : err.errors || [],
    };
  }

  // ── 2. Mongoose validation (e.g. enum value, min length not caught by our validators)
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return { statusCode: 422, message: 'Validation failed', errors };
  }

  // ── 3. Bad ObjectId → 400 (e.g. GET /api/courses/not-an-id)
  // 💡 The offending value is *not* echoed back: it is attacker-controlled input
  //    and echoing it can be used for reflected content injection.
  if (err instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      message: `Invalid value for field "${err.path}"`,
      errors: [{ field: err.path, message: 'Invalid identifier' }],
    };
  }

  // ── 4. Duplicate key (unique index) → 409
  // 💡 This is what the compound unique indexes protect: email, {student,course}, ...
  if (err.code === 11000 || err.code === 11001) {
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0] || 'field';
    return {
      statusCode: 409,
      message: `A record with that "${field}" already exists`,
      errors: [{ field, message: 'Already exists' }],
    };
  }

  // ── 5. JWT problems → 401
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { statusCode: 401, message: 'Invalid or expired authentication token', errors: [] };
  }

  // ── 6. Malformed JSON body (express.json) → 400
  if (err.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON in request body', errors: [] };
  }

  // ── 7. Body too large → 413
  if (err.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request payload is too large', errors: [] };
  }

  // ── 8. MongoDB unavailable → 503 (not a bug in the request)
  if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoNetworkError') {
    return {
      statusCode: 503,
      message: 'The database is temporarily unavailable. Please try again later.',
      errors: [],
    };
  }

  // ── 9. Anything else → 500
  // 💡 In production the raw message/stack is never sent to the client: it can
  //    contain connection strings, file paths or internal query details.
  return {
    statusCode: 500,
    message: production ? GENERIC_SERVER_ERROR : err.message || 'Internal server error',
    errors: [],
  };
};

// eslint-disable-next-line no-unused-vars -- Express detects the error middleware by its 4 arguments
const errorHandler = (err, req, res, _next) => {
  const { statusCode, message, errors } = normalizeError(err);

  // 💡 Only unexpected (5xx) errors are logged with a stack trace — client
  //    mistakes would flood the logs otherwise.
  if (statusCode >= 500) {
    console.error(`💥 ${statusCode} ${req.method} ${req.originalUrl} — unhandled error`, err);
  } else {
    console.warn(`⚠️  ${statusCode} ${req.method} ${req.originalUrl} → ${message}`);
  }

  const body = {
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
  };

  // 💡 The stack trace is a development-only convenience.
  if (!isProduction() && statusCode >= 500) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.normalizeError = normalizeError;
module.exports.GENERIC_SERVER_ERROR = GENERIC_SERVER_ERROR;
