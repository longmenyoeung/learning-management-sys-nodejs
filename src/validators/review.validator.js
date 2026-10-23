/**
 * ============================================================================
 *  ⭐ review.validator.js
 * ============================================================================
 *  rating → integer between 1 and 5 (the Mongoose schema enforces it again).
 * ============================================================================
 */
const { body, param, query } = require('express-validator');

/** POST /api/courses/:courseId/reviews */
const createReview = [
  param('courseId').isMongoId().withMessage('Invalid course id'),
  body('rating')
    .exists({ checkFalsy: true })
    .withMessage('Rating is required')
    .bail()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be a whole number between 1 and 5')
    .toInt(),
  body('comment')
    .optional()
    .isString()
    .withMessage('Comment must be a string')
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment must be at most 1000 characters'),
];

/** PATCH /api/reviews/:id */
const updateReview = [
  param('id').isMongoId().withMessage('Invalid review id'),
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be a whole number between 1 and 5')
    .toInt(),
  body('comment').optional().isString().trim().isLength({ max: 1000 }),
  body().custom((_value, { req }) => {
    if (req.body.rating === undefined && req.body.comment === undefined) {
      throw new Error('Provide at least one field to update (rating, comment)');
    }
    return true;
  }),
];

/** :id (PATCH / DELETE /api/reviews/:id) */
const reviewId = [param('id').isMongoId().withMessage('Invalid review id')];

/** GET /api/courses/:courseId/reviews?rating=&sort=&page=&limit= */
const listReviews = [
  param('courseId').isMongoId().withMessage('Invalid course id'),
  query('rating').optional().isInt({ min: 1, max: 5 }).toInt(),
  query('sort').optional().isIn(['newest', 'oldest', 'rating_desc', 'rating_asc']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { createReview, updateReview, reviewId, listReviews };
