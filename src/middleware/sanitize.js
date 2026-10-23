/**
 * ============================================================================
 *  🧼 sanitize.js — defense in depth against NoSQL operator injection
 * ============================================================================
 *  An extended query string like `?rating[$gt]=0` (or a JSON body such as
 *  `{ "email": { "$ne": null } }`) becomes a **MongoDB operator** instead of a
 *  value. Even though every route validates its inputs, one forgotten validator
 *  should not turn into an authentication bypass, so this middleware removes:
 *
 *      • keys starting with `$`  (`$gt`, `$ne`, `$where`, ...)
 *      • keys containing `.`     (path traversal: `password.reset`)
 *
 *  💡 `server.js` also sets `app.set('query parser', 'simple')` and disables
 *     the *extended* urlencoded parser, so nested query objects cannot be
 *     produced in the first place. This middleware covers request bodies.
 * ============================================================================
 */

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const hasForbiddenKey = (key) => key.startsWith('$') || key.includes('.');

/**
 * Deep-copy a value without dangerous MongoDB keys.
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 */
const sanitizeValue = (value, seen = new WeakSet()) => {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen));
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return undefined; // circular reference → drop it

  seen.add(value);
  const clean = {};
  for (const [key, nested] of Object.entries(value)) {
    if (hasForbiddenKey(key)) continue;
    clean[key] = sanitizeValue(nested, seen);
  }
  return clean;
};

/** Remove forbidden keys from an object *in place* (needed for `req.query`). */
const sanitizeObjectInPlace = (target = {}) => {
  for (const key of Object.keys(target)) {
    if (hasForbiddenKey(key)) {
      delete target[key];
    } else {
      target[key] = sanitizeValue(target[key]);
    }
  }
  return target;
};

/**
 * Express middleware — sanitize `body`, `query` and `params`.
 * 💡 Must be mounted *after* `express.json()` / `express.urlencoded()`.
 */
const sanitizeRequest = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = Array.isArray(req.body) ? sanitizeValue(req.body) : sanitizeObjectInPlace(req.body);
  }
  if (req.query && typeof req.query === 'object') sanitizeObjectInPlace(req.query);
  if (req.params && typeof req.params === 'object') sanitizeObjectInPlace(req.params);
  return next();
};

module.exports = sanitizeRequest;
module.exports.sanitizeRequest = sanitizeRequest;
module.exports.sanitizeValue = sanitizeValue;
module.exports.sanitizeObjectInPlace = sanitizeObjectInPlace;
