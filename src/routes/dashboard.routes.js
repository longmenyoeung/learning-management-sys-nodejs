/**
 * ============================================================================
 *  🛣️  dashboard.routes.js  →  mounted at /api/dashboard
 * ============================================================================
 *  💡 Each dashboard has its own role guard, so a student can never call the
 *     admin statistics by mistake (`role authorization` middleware).
 * ============================================================================
 */
const express = require('express');
const {
  getStudentDashboard,
  getTeacherDashboard,
  getAdminDashboard,
} = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate); // 🔒 every dashboard requires a token

/**
 * @openapi
 * /dashboard/student:
 *   get:
 *     tags: [Dashboard]
 *     summary: Student dashboard
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Course counters and average progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalCourses: { type: integer, example: 5 }
 *                     completedCourses: { type: integer, example: 2 }
 *                     inProgressCourses: { type: integer, example: 3 }
 *                     averageProgress: { type: integer, example: 68 }
 *                     courses: { type: array, items: { type: object } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/student', authorize('student'), getStudentDashboard);

/**
 * @openapi
 * /dashboard/teacher:
 *   get:
 *     tags: [Dashboard]
 *     summary: Teacher dashboard (an admin sees the whole platform)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Course / student / enrollment counters + per-course statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalCourses: { type: integer, example: 5 }
 *                     totalStudents: { type: integer, example: 250 }
 *                     totalEnrollments: { type: integer, example: 320 }
 *                     averageCompletionRate: { type: integer, example: 72 }
 *                     courses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           title: { type: string, example: Node.js API }
 *                           students: { type: integer, example: 120 }
 *                           rating: { type: number, example: 4.6 }
 *                           completionRate: { type: integer, example: 72 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/teacher', authorize('teacher', 'admin'), getTeacherDashboard);

/**
 * @openapi
 * /dashboard/admin:
 *   get:
 *     tags: [Dashboard]
 *     summary: Admin dashboard (platform statistics)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 'Counters: users, teachers, students, courses, categories, enrollments (+ extras)'
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users: { type: integer, example: 1000 }
 *                     teachers: { type: integer, example: 80 }
 *                     students: { type: integer, example: 900 }
 *                     courses: { type: integer, example: 150 }
 *                     categories: { type: integer, example: 20 }
 *                     enrollments: { type: integer, example: 5000 }
 *                     topRatedCourses: { type: array, items: { type: object } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/admin', authorize('admin'), getAdminDashboard);

module.exports = router;
