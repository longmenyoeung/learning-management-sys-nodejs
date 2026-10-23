/**
 * ============================================================================
 *  🔁 asyncHandler — removes try/catch noise from controllers
 * ============================================================================
 *  💡 Express 4 does not forward rejected promises to the error middleware, so
 *     every async controller is wrapped: `asyncHandler(async (req, res) => {...})`
 *     and any thrown ApiError ends up in `errorHandler` automatically.
 * ============================================================================
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
