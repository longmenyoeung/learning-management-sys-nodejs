/**
 * ============================================================================
 *  📖 swagger.js — OpenAPI 3 documentation
 * ============================================================================
 *  💡 The routes document themselves with `@openapi` JSDoc comments
 *     (see src/routes/*.js). swagger-jsdoc scans those files and merges them
 *     with the reusable pieces defined below.
 *  💡 The `bearerAuth` security scheme is what makes the "Authorize 🔓" button
 *     appear in Swagger UI: log in, copy the `token`, paste it once and every
 *     protected endpoint can be tested from the browser.
 * ============================================================================
 */
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const PORT = process.env.PORT || process.env.PORT1 || 4000;
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;

/** Normalize the glob so it also works on Windows (backslashes). */
const routesGlob = path.join(__dirname, '..', 'routes', '*.js').replace(/\\/g, '/');

const definition = {
  openapi: '3.0.3',
  info: {
    title: '🎓 Learning Management System API',
    version: '1.0.0',
    description: [
      'REST API of a Learning Management System built with **Express.js**, **MongoDB/Mongoose** and **JWT**.',
      '',
      '### Roles',
      '| Role | What they can do |',
      '| --- | --- |',
      '| **admin** | manage users, categories, courses, see platform statistics |',
      '| **teacher** | create/manage **their own** courses, sections, lessons, see their students |',
      '| **student** | browse & enroll in courses, complete lessons, track progress, review |',
      '',
      '### How to authorize',
      '1. `POST /auth/register` (creates a *student*) or `POST /auth/login`.',
      '2. Copy the `token` from the response.',
      '3. Click **Authorize** 🔓 and paste the token (without the word `Bearer`).',
      '',
      '### Typical learning flow',
      'teacher creates course → sections → lessons → publish → student enrolls → ',
      'completes lessons (progress %) → finishes the course → writes a review.',
    ].join('\n'),
  },
  servers: [{ url: `${BASE_URL}/api`, description: 'Local development server' }],
  tags: [
    { name: 'Auth', description: 'Register, login, current user' },
    { name: 'Users', description: 'User management (admin only)' },
    { name: 'Categories', description: 'Course categories' },
    { name: 'Courses', description: 'Courses: CRUD + search / filter / sort / pagination' },
    { name: 'Sections', description: 'Sections of a course' },
    { name: 'Lessons', description: 'Lessons of a section' },
    { name: 'Enrollments', description: 'Students joining courses' },
    { name: 'Progress', description: 'Lesson completion and course progress' },
    { name: 'Reviews', description: 'Course ratings and comments' },
    { name: 'Dashboard', description: 'Statistics for student / teacher / admin' },
  ],
  components: {
    // 🔐 Paste a JWT here to call the protected endpoints from Swagger UI.
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT returned by /auth/login or /auth/register',
      },
    },
    schemas: {}, // 💡 filled in below (split into chunks for readability)
    responses: {}, // 💡 the reusable error responses
  },
};

/** ── 📦 Reusable schemas (referenced as #/components/schemas/<Name>) ─────── */
definition.components.schemas = {
  User: {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8b9' },
      name: { type: 'string', example: 'Long' },
      email: { type: 'string', format: 'email', example: 'long@example.com' },
      role: { type: 'string', enum: ['admin', 'teacher', 'student'], example: 'student' },
      avatar: { type: 'string', example: '' },
      isActive: { type: 'boolean', example: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  AuthResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Login successful' },
      token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      user: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8b9' },
          name: { type: 'string', example: 'Long' },
          email: { type: 'string', example: 'long@example.com' },
          role: { type: 'string', example: 'student' },
        },
      },
    },
  },
  Category: {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8b0' },
      name: { type: 'string', example: 'Web Development' },
      description: { type: 'string', example: 'Everything about the web' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Course: {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8c1' },
      title: { type: 'string', example: 'Node.js REST API' },
      description: { type: 'string', example: 'Learn how to build REST APIs with Node.js' },
      instructor: {
        nullable: true,
        oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/User' }],
      },
      category: {
        nullable: true,
        oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Category' }],
      },
      thumbnail: { type: 'string', example: '' },
      price: { type: 'number', example: 20 },
      level: {
        type: 'string',
        enum: ['beginner', 'intermediate', 'advanced'],
        example: 'beginner',
      },
      status: { type: 'string', enum: ['draft', 'published', 'archived'], example: 'draft' },
      rating: {
        type: 'number',
        example: 4.5,
        description: 'Average of all reviews (MongoDB aggregation)',
      },
      reviewCount: { type: 'integer', example: 125 },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Section: {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8d1' },
      course: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8c1' },
      title: { type: 'string', example: 'Express.js' },
      description: { type: 'string' },
      order: { type: 'integer', example: 2 },
      lessonCount: { type: 'integer', example: 5 },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Lesson: {
    type: 'object',
    properties: {
      _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8e1' },
      section: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8d1' },
      title: { type: 'string', example: 'What is Express?' },
      description: { type: 'string' },
      content: { type: 'string', example: 'Express is a minimal web framework ...' },
      videoUrl: { type: 'string', example: '' },
      duration: { type: 'integer', example: 12, description: 'Length in minutes' },
      order: { type: 'integer', example: 1 },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
};
/** ── 📦 More reusable schemas ────────────────────────────────────────────── */
definition.components.schemas.Enrollment = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8f1' },
    student: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8b9' },
    course: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/Course' }] },
    status: { type: 'string', enum: ['active', 'completed', 'cancelled'], example: 'active' },
    enrolledAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    progress: { type: 'integer', example: 60, description: 'Added by GET /enrollments/me' },
  },
};

definition.components.schemas.Progress = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a901' },
    student: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8b9' },
    course: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8c1' },
    lesson: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8e1' },
    completed: { type: 'boolean', example: true },
    completedAt: { type: 'string', format: 'date-time' },
  },
};

definition.components.schemas.Review = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a911' },
    student: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/User' }] },
    course: { type: 'string', example: '66f1f5b2c9d3a4b5e6f7a8c1' },
    rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
    comment: { type: 'string', example: 'Very useful course.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

definition.components.schemas.Pagination = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    count: { type: 'integer', example: 10, description: 'Documents in this page' },
    total: { type: 'integer', example: 42, description: 'Documents matching the filter' },
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 10 },
    totalPages: { type: 'integer', example: 5 },
  },
};

definition.components.schemas.Error = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'Course not found' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', example: 'price' },
          message: { type: 'string', example: 'Price must be >= 0' },
        },
      },
    },
  },
};

/** ── 🚫 Reusable error responses (referenced as #/components/responses/<Name>) */
const errorSchema = { $ref: '#/components/schemas/Error' };
definition.components.responses = {
  BadRequest: {
    description: '400 Bad Request — malformed input (bad ObjectId, bad JSON, ...)',
    content: { 'application/json': { schema: errorSchema } },
  },
  Unauthorized: {
    description: '401 Unauthorized — missing / invalid / expired token',
    content: { 'application/json': { schema: errorSchema } },
  },
  Forbidden: {
    description: '403 Forbidden — wrong role or you do not own the resource',
    content: { 'application/json': { schema: errorSchema } },
  },
  NotFound: {
    description: '404 Not Found',
    content: { 'application/json': { schema: errorSchema } },
  },
  Conflict: {
    description: '409 Conflict — duplicate (email, enrollment, review, ...)',
    content: { 'application/json': { schema: errorSchema } },
  },
  ValidationError: {
    description: '422 Validation Error',
    content: { 'application/json': { schema: errorSchema } },
  },
};

/** 💡 `apis` tells swagger-jsdoc which files contain the `@openapi` comments. */
const swaggerSpec = swaggerJsdoc({
  definition,
  apis: [routesGlob],
});

module.exports = swaggerSpec;
module.exports.definition = definition;


