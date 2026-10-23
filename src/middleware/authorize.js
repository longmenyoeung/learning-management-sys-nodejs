/**
 * ============================================================================
 *  👮 authorize — "may you use this route?"
 * ============================================================================
 *  Role based access control (RBAC). Usage:
 *
 *      router.post('/', authenticate, authorize('teacher', 'admin'), createCourse);
 *
 *  💡 Role authorization is only step 2 of the pipeline. Step 3 — *resource
 *     ownership* ("is this MY course?") — cannot happen here because it needs a
 *     database read, so it lives in src/utils/access.js and is called by the
 *     controllers.
 *
 *      Authentication → Role authorization → Resource ownership → Controller
 * ============================================================================
 */
const ApiError = require('../utils/ApiError');

/**
 * @param {...('admin'|'teacher'|'student')} roles - allowed roles
 * @returns {import('express').RequestHandler}
 */
const authorize = (...roles) => (req, _res, next) => {
  // 💡 Defensive: authorize() must be mounted after authenticate().
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  if (!roles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(
        `Access denied: this action requires the role ${roles.join(' or ')} (your role: ${req.user.role})`
      )
    );
  }

  return next();
};

module.exports = authorize;
module.exports.authorize = authorize;
