/**
 * ============================================================================
 *  🛣️  course.routes.js  →  mounted at /api/courses
 * ============================================================================
 *  💡 This router also mounts the nested routers that live under a course:
 *
 *      /api/courses/:courseId/sections   → section.routes.js
 *      /api/courses/:courseId/progress   → progress.routes.js
 *      /api/courses/:courseId/enroll     → enrollment.routes.js
 *      /api/courses/:courseId/students   → enrollment.routes.js
 *      /api/courses/:courseId/reviews    → review.routes.js
 *
 *  ⚠️ Order matters: the nested mounts are declared **before** `/:id`, otherwise
 *     `/api/courses/123/sections` could be swallowed by `GET /api/courses/:id`.
 *  💡 `express.Router({ mergeParams: true })` inside those files makes the
 *     `:courseId` parameter visible to them.
 * ============================================================================
 */
const express = require('express');
const {
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  deleteCourse,
} = require('../controllers/course.controller');
const authenticate = require('../middleware/authenticate');
const { authenticateOptional } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const courseValidators = require('../validators/course.validator');
const sectionRoutes = require('./section.routes');
const progressRoutes = require('./progress.routes');
const enrollmentRoutes = require('./enrollment.routes');
const reviewRoutes = require('./review.routes');

const router = express.Router();

// ── 🔗 Nested resources ─────────────────────────────────────────────────────
router.use('/:courseId/sections', sectionRoutes);
router.use('/:courseId/progress', progressRoutes);
router.use('/:courseId/reviews', reviewRoutes);
router.use('/:courseId', enrollmentRoutes); // GET /students + POST|DELETE /enroll

/**
 * @openapi
 * /courses:
 *   post:
 *     tags: [Courses]
 *     summary: Create a course (teacher or admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, category]
 *             properties:
 *               title: { type: string, example: Node.js REST API }
 *               description: { type: string, example: Learn how to build REST APIs with Node.js }
 *               category: { type: string, example: 66f1f5b2c9d3a4b5e6f7a8b9 }
 *               instructor: { type: string, description: 'admin only: create on behalf of a teacher' }
 *               thumbnail: { type: string }
 *               price: { type: number, minimum: 0, example: 20 }
 *               level: { type: string, enum: [beginner, intermediate, advanced] }
 *               status: { type: string, enum: [draft, published, archived], default: draft }
 *     responses:
 *       201:
 *         description: Course created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Course' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Courses]
 *     summary: Search / filter / sort / paginate courses (public)
 *     description: |
 *       Only `published` courses are listed unless a teacher or an admin asks for
 *       another status — and a teacher only sees their own drafts.
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: 'Matches title or description, e.g. node' }
 *       - { in: query, name: category, schema: { type: string }, description: Category id }
 *       - { in: query, name: instructor, schema: { type: string }, description: Teacher id }
 *       - { in: query, name: level, schema: { type: string, enum: [beginner, intermediate, advanced] } }
 *       - { in: query, name: price, schema: { type: number }, description: Exact price }
 *       - { in: query, name: price_from, schema: { type: number } }
 *       - { in: query, name: price_to, schema: { type: number } }
 *       - { in: query, name: status, schema: { type: string, enum: [draft, published, archived] } }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, price_asc, price_desc, title_asc, title_desc] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       200:
 *         description: 'Page of courses, each enriched with rating + reviewCount'
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Pagination'
 *                 - type: object
 *                   properties:
 *                     hasNextPage: { type: boolean }
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Course' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router
  .route('/')
  .post(
    authenticate,
    authorize('teacher', 'admin'),
    courseValidators.createCourse,
    validate,
    createCourse
  )
  // 💡 optional auth: a visitor gets published courses, a teacher may query their drafts.
  .get(authenticateOptional, courseValidators.listCourses, validate, getCourses);

/**
 * @openapi
 * /courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get one course (public for published courses)
 *     description: Draft/archived courses are only visible to their instructor and to admins (403 otherwise).
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: 'Course + instructor/category + stats (sections, lessons, students, rating)'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Course' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Courses]
 *     summary: Update a course (owner teacher or admin)
 *     description: Teacher B editing Teacher A's course receives 403 Forbidden.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               category: { type: string }
 *               thumbnail: { type: string }
 *               price: { type: number, minimum: 0 }
 *               level: { type: string, enum: [beginner, intermediate, advanced] }
 *               status: { type: string, enum: [draft, published, archived] }
 *     responses:
 *       200: { description: Course updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Courses]
 *     summary: Delete a course and everything inside it (owner teacher or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 'Deleted (sections, lessons, enrollments, progress rows, reviews)' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(authenticateOptional, courseValidators.courseId, validate, getCourse)
  .patch(
    authenticate,
    authorize('teacher', 'admin'),
    courseValidators.updateCourse,
    validate,
    updateCourse
  )
  .delete(
    authenticate,
    authorize('teacher', 'admin'),
    courseValidators.courseId,
    validate,
    deleteCourse
  );

module.exports = router;

