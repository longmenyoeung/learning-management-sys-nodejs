/**
 * ============================================================================
 *  📝 lesson.validator.js
 * ============================================================================
 *  Rules from the project brief:
 *     title    → required
 *     content  → required
 *     duration → number > 0 (integer minutes)
 * ============================================================================
 */
const { body, param, query } = require('express-validator');

/** POST /api/sections/:sectionId/lessons */
const createLesson = [
  param('sectionId').isMongoId().withMessage('Invalid section id'),
  body('title')
    .exists({ checkFalsy: true })
    .withMessage('Lesson title is required')
    .bail()
    .isString()
    .withMessage('Title must be a string')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Title must be between 2 and 200 characters'),
  body('content')
    .exists({ checkFalsy: true })
    .withMessage('Lesson content is required')
    .bail()
    .isString()
    .withMessage('Content must be a string')
    .trim()
    .isLength({ min: 1, max: 20000 })
    .withMessage('Content must be between 1 and 20000 characters'),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('videoUrl').optional({ checkFalsy: true }).isString().trim().isLength({ max: 500 }),
  body('duration')
    .exists({ checkFalsy: true })
    .withMessage('Lesson duration is required')
    .bail()
    .isInt({ min: 1 })
    .withMessage('Duration must be an integer number of minutes greater than 0')
    .toInt(),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Order must be an integer greater than or equal to 0')
    .toInt(),
];

/** PATCH /api/lessons/:id */
const updateLesson = [
  param('id').isMongoId().withMessage('Invalid lesson id'),
  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Title must be between 2 and 200 characters'),
  body('content')
    .optional()
    .isString()
    .withMessage('Content must be a string')
    .trim()
    .isLength({ min: 1, max: 20000 }),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('videoUrl').optional({ checkFalsy: true }).isString().trim().isLength({ max: 500 }),
  body('duration')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Duration must be an integer greater than 0')
    .toInt(),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be >= 0').toInt(),
  body().custom((_value, { req }) => {
    const allowed = ['title', 'content', 'description', 'videoUrl', 'duration', 'order'];
    if (!allowed.some((field) => req.body[field] !== undefined)) {
      throw new Error(`Provide at least one field to update (${allowed.join(', ')})`);
    }
    return true;
  }),
];

/** :id / :lessonId */
const lessonId = [param('id').isMongoId().withMessage('Invalid lesson id')];
const lessonIdParam = [param('lessonId').isMongoId().withMessage('Invalid lesson id')];

/** GET /api/sections/:sectionId/lessons?search=&withContent=&page=&limit= */
const listLessons = [
  param('sectionId').isMongoId().withMessage('Invalid section id'),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('withContent').optional().isBoolean().toBoolean(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { createLesson, updateLesson, lessonId, lessonIdParam, listLessons };
