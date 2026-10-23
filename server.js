/**
 * ============================================================================
 *  🚀 server.js — application entry point
 * ============================================================================
 *  Responsibilities (in order):
 *    1. load the environment variables (.env)
 *    2. create the Express app (global middleware + routes + error handling)
 *    3. connect to MongoDB and listen on the configured port
 *
 *  💡 The Express `app` is exported so the test suite (Vitest + Supertest) can
 *     use it **without** starting a real HTTP server or a second database
 *     connection — `startServer()` only runs when the file is executed directly
 *     (`node server.js` / `npm start`).
 * ============================================================================
 */
require('dotenv').config(); // ⚠️ must come first: everything below reads process.env

// 💡 Fail fast (in production) on missing/weak secrets *before* any router or
//    limiter is created from the environment.
const { validateEnv, isProduction } = require('./src/config/env');
validateEnv();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = require('./src/docs/swagger');
const connectDB = require('./src/config/db');
const { disconnectDB } = require('./src/config/db');
const { buildCorsOptions } = require('./src/config/cors');
const { apiLimiter } = require('./src/middleware/rateLimit');
const sanitizeRequest = require('./src/middleware/sanitize');
const forceHttps = require('./src/middleware/forceHttps');
const notFound = require('./src/middleware/notFound');
const errorHandler = require('./src/middleware/errorHandler');

// ── 🛣️  Routers ─────────────────────────────────────────────────────────────
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const categoryRoutes = require('./src/routes/category.routes');
const courseRoutes = require('./src/routes/course.routes');
const sectionRoutes = require('./src/routes/section.routes');
const lessonRoutes = require('./src/routes/lesson.routes');
const enrollmentRoutes = require('./src/routes/enrollment.routes');
const reviewRoutes = require('./src/routes/review.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');

const app = express();

// 💡 Trust the first reverse-proxy hop in production so `req.ip`, rate limiting
//    and HTTPS detection use the real client address. Set TRUST_PROXY to the
//    number of proxies in front of the app (1 = nginx/Render/Heroku, 0 = direct).
const trustProxyHops = Number(process.env.TRUST_PROXY ?? (isProduction() ? 1 : 0));
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// 💡 "simple" ignores `?a[b]=c` nesting, so an attacker cannot turn a query
//    string into a MongoDB operator object (`?rating[$gt]=0`).
app.set('query parser', 'simple');
app.disable('x-powered-by');

// ── 🧱 Global middleware ────────────────────────────────────────────────────
app.use(helmet()); // 🔒 sensible security headers (CSP, HSTS, nosniff, ...)
app.use(forceHttps); // 🔒 redirect plain HTTP → HTTPS in production
app.use(cors(buildCorsOptions())); // 🌍 strict origin allow-list (see CORS_ORIGINS)

app.use(express.json({ limit: '1mb' })); // parse JSON bodies
// 💡 `extended: false` = no nested objects/arrays from form posts → no operator injection.
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 💡 Defense in depth: strips `$`-prefixed keys and dotted paths from body/query/params.
app.use(sanitizeRequest);

// 💡 Log format never includes the query string (tokens, emails, search terms …).
morgan.token('safe-url', (req) => req.originalUrl.split('?')[0]);
if (!isProduction() && process.env.NODE_ENV !== 'test') {
  app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
} else if (isProduction()) {
  app.use(morgan(':remote-addr :method :safe-url :status :response-time ms'));
}

// 💡 Exposing the full API surface + internal schemas in production is free
//    reconnaissance. Swagger UI is mounted only outside production, or when
//    explicitly enabled with ENABLE_SWAGGER=true (e.g. on a private staging host).
const swaggerEnabled = !isProduction() || process.env.ENABLE_SWAGGER === 'true';

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Auth]
 *     summary: Health check
 *     responses:
 *       200: { description: 'API is up ("database" tells whether MongoDB is connected)' }
 */
app.get('/health', (_req, res) =>
  res.json({
    success: true,
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
);

/** 💡 Small landing page so hitting the root is not a confusing 404. */
app.get('/', (_req, res) =>
  res.json({
    success: true,
    name: '🎓 Learning Management System API',
    version: '1.0.0',
    // 💡 The docs URL is only advertised when the docs are actually mounted.
    ...(swaggerEnabled && { documentation: '/api-docs' }),
    health: '/health',
    quickStart: [
      'POST   /api/auth/register',
      'POST   /api/auth/login',
      'GET    /api/auth/me',
      'POST   /api/auth/logout',
      'PATCH  /api/auth/password',
      'GET    /api/courses',
      'POST   /api/courses',
      'POST   /api/courses/:courseId/enroll',
      'POST   /api/lessons/:lessonId/complete',
      'GET    /api/courses/:courseId/progress',
      'GET    /api/dashboard/student|teacher|admin',
    ],
  })
);

// ── 📖 Swagger UI (development only) ────────────────────────────────────────
if (swaggerEnabled) {
  // 💡 Helmet's default CSP blocks the inline scripts of Swagger UI, so the
  //    policy is relaxed *only* for /api-docs.
  app.use(
    '/api-docs',
    helmet.contentSecurityPolicy({
      useDefaults: true,
      directives: {
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: '🎓 LMS API Docs',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    })
  );
}

// ── 🚦 Rate limiting ────────────────────────────────────────────────────────
// 💡 Broad limiter for the whole API. The stricter auth limiter is applied per
//    route in src/routes/auth.routes.js (login/register/reset-password).
app.use('/api', apiLimiter);

// ── 🛣️  API routes ──────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);

// 💡 `/api/courses` also nests sections, enrollments, progress and reviews.
app.use('/api/courses', courseRoutes);

// 💡 `/api/sections/:id` (sections) and `/api/sections/:sectionId/lessons` (lessons)
app.use('/api/sections', sectionRoutes);
app.use('/api/sections/:sectionId/lessons', lessonRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── 🚫 404 + 🚨 central error handler (must be the LAST middleware) ─────────
app.use(notFound);
app.use(errorHandler);

// ── 🎧 Bootstrapping ────────────────────────────────────────────────────────
const PORT = process.env.PORT || process.env.PORT1 || 4000; // PORT2 is kept as a spare
// 💡 Render (and most PaaS providers) route traffic to 0.0.0.0. Binding the
//    wildcard address explicitly avoids an IPv6-only listener on some hosts.
const HOST = process.env.BIND_HOST || '0.0.0.0';

const startServer = async () => {
  await connectDB();

  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

  const server = app.listen(PORT, HOST, () => {
    console.log(`\n🚀 LMS API listening on ${publicUrl} (bound to ${HOST}:${PORT})`);
    if (swaggerEnabled) console.log(`📖 Swagger UI    →  ${publicUrl}/api-docs`);
    console.log(`❤️  Health check  →  ${publicUrl}/health\n`);
  });

  // 💡 Close the HTTP server + the database connection cleanly (Ctrl+C, Docker stop, ...)
  const shutdown = async (signal) => {
    console.log(`\n👋 ${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

  return server;
};

// ⚠️ Only listen when this file is run directly (tests import `app` instead).
if (require.main === module) {
  startServer().catch((error) => {
    console.error('❌ Failed to start the server:', error.message);
    process.exit(1);
  });
}

module.exports = { app, startServer };

