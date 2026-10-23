/**
 * ============================================================================
 *  🛣️  review.routes.js
 * ============================================================================
 *  💡 One router, two mount points:
 *
 *      /api/courses/:courseId/reviews   →  POST /   GET /
 *      /api/reviews/:id                 →  PATCH /:id   DELETE /:id
 * ============================================================================
 */
const express = require('express');
const {
  createReview,
  getCourseReviews,
  updateReview,
  deleteReview,
} = require('../controllers/review.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const reviewValidators = require('../validators/review.validator');

const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * /courses/{courseId}/reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Review a course (enrolled student)
 *     description: |
 *       Refused with **403** when the student is not enrolled in the course and
 *       with **409** when they already reviewed it (one review per student per
 *       course, enforced by a compound unique index).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *               comment: { type: string, example: Very useful course. }
 *     responses:
 *       201:
 *         description: Review created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Review' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     courseRating: { type: number, example: 4.5 }
 *                     reviewCount: { type: integer, example: 12 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Reviews]
 *     summary: List the reviews of a course (public)
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *       - { in: query, name: rating, schema: { type: integer, minimum: 1, maximum: 5 } }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, rating_desc, rating_asc] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: 'Reviews + summary { averageRating, reviewCount, distribution }'
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/')
  .post(
    authenticate,
    authorize('student'),
    reviewValidators.createReview,
    validate,
    createReview
  )
  .get(reviewValidators.listReviews, validate, getCourseReviews);

/**
 * @openapi
 * /reviews/{id}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Update a review (author or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       200: { description: Review updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review (author or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 'Review deleted (course rating recalculated)' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .patch(authenticate, reviewValidators.updateReview, validate, updateReview)
  .delete(authenticate, reviewValidators.reviewId, validate, deleteReview);

module.exports = router;
