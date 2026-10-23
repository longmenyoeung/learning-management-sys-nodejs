/**
 * ============================================================================
 *  🛣️  enrollment.routes.js
 * ============================================================================
 *  💡 One router, two mount points:
 *
 *      /api/courses/:courseId/enroll      →  POST   (student joins)
 *      /api/courses/:courseId/enroll      →  DELETE (student leaves)
 *      /api/courses/:courseId/students    →  GET    (teacher/admin)
 *      /api/enrollments/me                →  GET    (student's own courses)
 * ============================================================================
 */
const express = require('express');
const {
  enrollInCourse,
  getMyEnrollments,
  getCourseStudents,
  cancelEnrollment,
} = require('../controllers/enrollment.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const courseValidators = require('../validators/course.validator');

const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * /courses/{courseId}/enroll:
 *   post:
 *     tags: [Enrollments]
 *     summary: Enroll in a course (student only)
 *     description: |
 *       🚫 The request is refused when:
 *         * the caller is not a student (403)
 *         * the caller is the instructor of the course (403)
 *         * the course is not `published` (400)
 *         * the student is already enrolled (409)
 *       A previously cancelled enrollment is reactivated instead of duplicated.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *     responses:
 *       201:
 *         description: Enrolled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Enrollment' }
 *       200: { description: A cancelled enrollment was reactivated }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [Enrollments]
 *     summary: Cancel an enrollment
 *     description: |
 *       A student cancels their own enrollment. A teacher/admin can remove a
 *       student of their own course with `?studentId=<userId>`.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *       - { in: query, name: studentId, schema: { type: string }, description: 'teacher/admin only: which student to remove' }
 *     responses:
 *       200: { description: 'Enrollment cancelled (progress rows are kept)' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post(
  '/enroll',
  authenticate,
  authorize('student'),
  courseValidators.courseIdParam,
  validate,
  enrollInCourse
);
router.delete(
  '/enroll',
  authenticate,
  courseValidators.courseIdParam,
  validate,
  cancelEnrollment
);

/**
 * @openapi
 * /courses/{courseId}/students:
 *   get:
 *     tags: [Enrollments]
 *     summary: List the students of a course (owner teacher or admin)
 *     description: Each student comes with `completedLessons`, `totalLessons` and `progress` (aggregation).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, completed, cancelled] } }
 *     responses:
 *       200: { description: Students of the course }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/students',
  authenticate,
  authorize('teacher', 'admin'),
  courseValidators.courseIdParam,
  validate,
  getCourseStudents
);

/**
 * @openapi
 * /enrollments/me:
 *   get:
 *     tags: [Enrollments]
 *     summary: My courses (student)
 *     description: Returns the courses the logged-in user is enrolled in, with their live progress.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [active, completed, cancelled] }, description: 'cancelled enrollments are hidden by default' }
 *     responses:
 *       200:
 *         description: Enrollments of the current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 count: { type: integer }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Enrollment' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', authenticate, getMyEnrollments);

module.exports = router;
