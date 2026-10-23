/**
 * ============================================================================
 *  🕳️  notFound — 404 for unknown routes
 * ============================================================================
 *  Mounted *after* every router, so any request that reached this point matched
 *  no route at all. It converts "silent hang" into a clean 404 JSON body.
 * ============================================================================
 */
const ApiError = require('../utils/ApiError');

const notFound = (req, _res, next) => {
  // 💡 Query strings are dropped: they are attacker-controlled and would end up
  //    in logs / error messages verbatim.
  const path = req.originalUrl.split('?')[0];
  next(ApiError.notFound(`Route ${req.method} ${path} not found`));
};

module.exports = notFound;
module.exports.notFound = notFound;
