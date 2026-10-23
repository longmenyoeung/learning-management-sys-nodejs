/**
 * ============================================================================
 *  🛡️  validate — turns express-validator results into a 422 response
 * ============================================================================
 *  Every validator chain (src/validators/*.js) is followed by this middleware:
 *
 *      router.post('/', courseValidators.createCourse, validate, createCourse);
 *
 *  💡 The frontend receives a field-by-field list so it can highlight the
 *     offending inputs:
 *
 *        { "success": false, "message": "Validation failed",
 *          "errors": [{ "field": "price", "message": "Price must be >= 0" }] }
 * ============================================================================
 */
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validate = (req, _res, next) => {
  const result = validationResult(req);

  if (result.isEmpty()) return next();

  const errors = result.array().map((error) => ({
    field: error.path || error.param,
    message: error.msg,
    location: error.location, // body | params | query
    value: error.value,
  }));

  // 💡 422 Unprocessable Entity = "syntax is fine, semantics are not".
  return next(ApiError.unprocessable('Validation failed', errors));
};

module.exports = validate;
module.exports.validate = validate;
