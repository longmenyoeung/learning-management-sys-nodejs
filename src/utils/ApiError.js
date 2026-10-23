/**
 * ============================================================================
 *  ❌ ApiError — one error class for the whole API
 * ============================================================================
 *  💡 Every controller throws `ApiError.notFound(...)` etc. and `errorHandler`
 *     translates it into a consistent JSON response:
 *        { success: false, message: "...", errors: [...] }
 *  💡 `isOperational` marks errors we expect (404, 409, ...) versus real bugs
 *     (500) — useful when wiring up logging/alerting later.
 * ============================================================================
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - human readable message
   * @param {Array<{field?:string, message:string}>} [errors] - extra validation details
   * @param {boolean} [isOperational] - true when the error is expected (client's fault)
   */
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    // 💡 Captures a clean stack trace that excludes this constructor frame.
    Error.captureStackTrace(this, this.constructor);
  }

  // ── 400 ───────────────────────────────────────────────────────────────────
  static badRequest(message = 'Bad request', errors = []) {
    return new ApiError(400, message, errors);
  }

  // ── 401 ───────────────────────────────────────────────────────────────────
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  // ── 403 ───────────────────────────────────────────────────────────────────
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  // ── 409 (duplicate enrollment, duplicate email, ...) ──────────────────────
  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  // ── 422 (express-validator failures) ──────────────────────────────────────
  static unprocessable(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }

  // ── 500 (unexpected bug) ──────────────────────────────────────────────────
  static internal(message = 'Internal server error', isOperational = false) {
    return new ApiError(500, message, [], isOperational);
  }
}

module.exports = ApiError;
