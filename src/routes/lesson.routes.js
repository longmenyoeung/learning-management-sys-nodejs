/**
 * ============================================================================
 *  🛣️  lesson.routes.js
 * ============================================================================
 *  💡 One router, two mount points (see server.js + course.routes.js):
 *
 *      /api/sections/:sectionId/lessons   →  POST /   GET /
 *      /api/lessons/:id                   →  GET /:id  PATCH /:id  DELETE /:id
 *      /api/lessons/:lessonId/complete    →  POST
 * ============================================================================
 */
const express = require('express');
const {
  createLesson,
  getLessonsBySection,
  getLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
} = require('../controllers/lesson.controller');
const authenticate = require('../middleware/authenticate');
const { authenticateOptional } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const lessonValidators = require('../validators/lesson.validator');

const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * /sections/{sectionId}/lessons:
 *   post:
 *     tags: [Lessons]
 *     summary: Add a lesson to a section (owner teacher or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: sectionId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content, duration]
 *             properties:
 *               title: { type: string, example: What is Express? }
 *               description: { type: string }
 *               content: { type: string, example: Express is a minimal web framework ... }
 *               videoUrl: { type: string }
 *               duration: { type: integer, minimum: 1, example: 12, description: minutes }
 *               order: { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Lesson created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Lesson' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Lessons]
 *     summary: List the lessons of a section (public, content gated)
 *     description: |
 *       Lesson titles are public. The `content` field is only returned to the
 *       course instructor, admins and enrolled students — the flag
 *       `hasAccessToContent` tells the client which case applies.
 *     parameters:
 *       - { in: path, name: sectionId, required: true, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50 } }
 *     responses:
 *       200: { description: Lessons sorted by `order` }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/')
  .post(
    authenticate,
    authorize('teacher', 'admin'),
    lessonValidators.createLesson,
    validate,
    createLesson
  )
  .get(authenticateOptional, lessonValidators.listLessons, validate, getLessonsBySection);

/**
 * @openapi
 * /lessons/{lessonId}/complete:
 *   post:
 *     tags: [Progress]
 *     summary: Mark a lesson as completed (enrolled student)
 *     description: |
 *       Refused with **403** when the student is not enrolled in the course that
 *       contains the lesson, and with **409** when the lesson was already
 *       completed. When the last lesson is completed the enrollment automatically
 *       becomes `completed` (progress = 100).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: lessonId, required: true, schema: { type: string } }
 *     responses:
 *       201:
 *         description: Lesson completed (returns the new course progress)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalLessons: { type: integer, example: 20 }
 *                     completedLessons: { type: integer, example: 12 }
 *                     progress: { type: integer, example: 60 }
 *                     completed: { type: boolean, example: false }
 *                     nextLessonId: { type: string, nullable: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/:lessonId/complete',
  authenticate,
  authorize('student'),
  lessonValidators.lessonIdParam,
  validate,
  completeLesson
);

/**
 * @openapi
 * /lessons/{id}:
 *   get:
 *     tags: [Lessons]
 *     summary: Get one lesson (public, content gated)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 'The lesson (content included only when allowed)' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Lessons]
 *     summary: Update a lesson (owner teacher or admin)
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
 *               content: { type: string }
 *               videoUrl: { type: string }
 *               duration: { type: integer, minimum: 1 }
 *               order: { type: integer, minimum: 0 }
 *     responses:
 *       200: { description: Lesson updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Lessons]
 *     summary: Delete a lesson and its progress rows (owner teacher or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Lesson deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(authenticateOptional, lessonValidators.lessonId, validate, getLesson)
  .patch(
    authenticate,
    authorize('teacher', 'admin'),
    lessonValidators.updateLesson,
    validate,
    updateLesson
  )
  .delete(
    authenticate,
    authorize('teacher', 'admin'),
    lessonValidators.lessonId,
    validate,
    deleteLesson
  );

module.exports = router;

