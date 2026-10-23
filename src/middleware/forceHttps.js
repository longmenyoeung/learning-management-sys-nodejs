/**
 * ============================================================================
 *  🔒 forceHttps.js — redirect plain HTTP to HTTPS in production
 * ============================================================================
 *  💡 Helmet's HSTS header only protects clients that already reached the site
 *     over TLS. This middleware makes sure a request that reaches the app over
 *     plain HTTP is sent to the HTTPS URL instead.
 *
 *  Behind a TLS-terminating proxy (Render, Heroku, nginx, ...) the original
 *  scheme arrives in `X-Forwarded-Proto`, which requires `trust proxy` to be
 *  configured (see TRUST_PROXY in server.js).
 *
 *  Disable deliberately with FORCE_HTTPS=false (e.g. for local containers).
 * ============================================================================
 */
const { isProduction } = require('../config/env');

const forceHttps = (req, res, next) => {
  if (!isProduction() || process.env.FORCE_HTTPS === 'false') return next();

  const forwardedProto = req.get('x-forwarded-proto');
  if (req.secure || forwardedProto === 'https') return next();

  const host = req.get('host');
  if (!host) return next();

  // 💡 308 keeps the HTTP method and body for non-GET requests.
  return res.redirect(308, `https://${host}${req.originalUrl}`);
};

module.exports = forceHttps;
module.exports.forceHttps = forceHttps;
