/**
 * ============================================================================
 *  🌍 cors.js — explicit origin allow-list
 * ============================================================================
 *  💡 `app.use(cors())` would reflect *any* origin (`Access-Control-Allow-Origin: *`).
 *     Here only origins listed in CORS_ORIGINS are accepted.
 *
 *  Development fallback (when CORS_ORIGINS is empty):
 *      http://localhost:3000, http://localhost:5173 (Vite), 127.0.0.1 equivalents
 *      + the API's own origin (needed by Swagger UI "Try it out")
 *
 *  Production: set CORS_ORIGINS=https://app.example.com,https://admin.example.com
 *  Requests without an `Origin` header (curl, server-to-server, mobile apps) are
 *  allowed — CORS is a browser mechanism, not an authentication mechanism.
 * ============================================================================
 */
const ApiError = require('../utils/ApiError');
const { isProduction } = require('./env');

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
];

/** `"https://a.com, https://b.com"` → `['https://a.com', 'https://b.com']` */
const parseOrigins = (value = '') =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== 'null');

/** The API's own public origin (Swagger UI calls the API from here). */
const getApiOrigin = () => {
  const port = process.env.PORT || process.env.PORT1 || 4000;
  // 💡 On Render the public URL is available as RENDER_EXTERNAL_URL, so the
  //    allow-list is correct without setting API_BASE_URL by hand.
  const baseUrl =
    process.env.API_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${port}`;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
};

/**
 * @returns {{ origins: string[], allowAll: boolean }}
 */
const resolveAllowedOrigins = () => {
  const configured = parseOrigins(process.env.CORS_ORIGINS);
  const origins = new Set(
    configured.length > 0 ? configured : isProduction() ? [] : DEVELOPMENT_ORIGINS
  );

  const apiOrigin = getApiOrigin();
  if (apiOrigin) origins.add(apiOrigin);

  const list = [...origins];
  return { origins: list, allowAll: list.includes('*') };
};

/**
 * Build the options object for the `cors` middleware.
 * @returns {import('cors').CorsOptions}
 */
const buildCorsOptions = () => {
  const { origins, allowAll } = resolveAllowedOrigins();

  return {
    origin(origin, callback) {
      // 💡 No Origin header → not a browser CORS request (curl, Postman, SSR).
      if (!origin) return callback(null, true);
      if (allowAll || origins.includes(origin)) return callback(null, true);
      return callback(ApiError.forbidden(`Origin ${origin} is not allowed by CORS`));
    },
    // 💡 Authentication uses the Authorization header (Bearer JWT), not cookies.
    //    Keeping credentials off avoids the CSRF surface entirely.
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
};

module.exports = { buildCorsOptions, resolveAllowedOrigins, parseOrigins };
