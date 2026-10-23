/**
 * ============================================================================
 *  🛣️  progress.routes.js  →  mounted at /api/courses/:courseId/progress
 * ============================================================================
 *  💡 Progress is *never* written directly: it is a consequence of
 *     `POST /api/lessons/:lessonId/complete`. This router only reads it.
 * ============================================================================
 */
const express = require('express');
const { param, query } = require('express-validator');
const { getCourseProgress } = require('../controllers/progress.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');

const router = express.Router({ mergeParams: true });

/** 💡 Small inline validator chain (only used here). */
const progressQuery = [
  param('courseId').isMongoId().withMessage('Invalid course id'),
  query('studentId')
    .optional()
    .isMongoId()
    .withMessage('studentId must be a valid user id'),
  query('details').optional().isBoolean().withMessage('details must be true or false').toBoolean(),
];

/**
 * @openapi
 * /courses/{courseId}/progress:
 *   get:
 *     tags: [Progress]
 *     summary: My progress inside a course (student)
 *     description: |
 *       A student reads their own progress (an enrollment is required, otherwise
 *       403). The instructor of the course or an admin can read any student's
 *       progress with `?studentId=<userId>`.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *       - { in: query, name: studentId, schema: { type: string }, description: 'owner teacher / admin only' }
 *       - { in: query, name: details, schema: { type: boolean }, description: 'include the per-lesson completion list' }
 *     responses:
 *       200:
 *         description: Course progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     course: { type: string, example: Node.js REST API }
 *                     totalLessons: { type: integer, example: 20 }
 *                     completedLessons: { type: integer, example: 12 }
 *                     progress: { type: integer, example: 60 }
 *                     completed: { type: boolean, example: false }
 *                     nextLessonId: { type: string, nullable: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/', authenticate, progressQuery, validate, getCourseProgress);

module.exports = router;
