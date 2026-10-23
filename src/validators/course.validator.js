/**
 * ============================================================================
 *  📚 course.validator.js — create / update / search rules
 * ============================================================================
 *  💡 Search & pagination parameters are validated too: `?price=abc` must be a
 *     422, not a silent empty result.
 * ============================================================================
 */
const { body, param, query } = require('express-validator');
const { LEVELS, STATUSES } = require('../models/Course');

/** :id / :courseId */
const courseId = [param('id').isMongoId().withMessage('Invalid course id')];
const courseIdParam = [param('courseId').isMongoId().withMessage('Invalid course id')];

/**
 * 💡 Rule builders: `titleRule()` for POST (required) and `titleRule(true)` for
 *    PATCH (optional). Written with an explicit if/else because express-validator
 *    builds its fluent chain lazily (a dynamic `body('x')['exists']()` lookup
 *    would break the chain).
 */
const titleRule = (optional = false) => {
  const chain = body('title');
  if (optional) chain.optional();
  else
    chain
      .exists({ checkFalsy: true })
      .withMessage('Course title is required')
      .bail();
  return chain
    .isString()
    .withMessage('Title must be a string')
    .trim()
    .isLength({ min: 3, max: 150 })
    .withMessage('Title must be between 3 and 150 characters');
};

const descriptionRule = (optional = false) => {
  const chain = body('description');
  if (optional) chain.optional();
  else
    chain
      .exists({ checkFalsy: true })
      .withMessage('Course description is required')
      .bail();
  return chain
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Description must be between 10 and 5000 characters');
};

/** POST /api/courses */
const createCourse = [
  titleRule(),
  descriptionRule(),
  body('category')
    .exists({ checkFalsy: true })
    .withMessage('Category is required')
    .bail()
    .isMongoId()
    .withMessage('Category must be a valid category id'),
  // 💡 Admin only: create a course on behalf of another teacher.
  body('instructor')
    .optional()
    .isMongoId()
    .withMessage('Instructor must be a valid user id'),
  body('thumbnail').optional().isString().trim().isLength({ max: 500 }),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a number greater than or equal to 0')
    .toFloat(),
  body('level')
    .optional()
    .isIn(LEVELS)
    .withMessage(`Level must be one of: ${LEVELS.join(', ')}`),
  body('status')
    .optional()
    .isIn(STATUSES)
    .withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
];

/** PATCH /api/courses/:id */
const updateCourse = [
  param('id').isMongoId().withMessage('Invalid course id'),
  titleRule(true),
  descriptionRule(true),
  body('category').optional().isMongoId().withMessage('Category must be a valid category id'),
  body('thumbnail').optional().isString().trim().isLength({ max: 500 }),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a number greater than or equal to 0')
    .toFloat(),
  body('level')
    .optional()
    .isIn(LEVELS)
    .withMessage(`Level must be one of: ${LEVELS.join(', ')}`),
  body('status')
    .optional()
    .isIn(STATUSES)
    .withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
  body().custom((_value, { req }) => {
    const allowed = ['title', 'description', 'category', 'thumbnail', 'price', 'level', 'status'];
    if (!allowed.some((field) => req.body[field] !== undefined)) {
      throw new Error(`Provide at least one field to update (${allowed.join(', ')})`);
    }
    return true;
  }),
];

/**
 * GET /api/courses query string:
 *   ?search=node&category=ID&level=beginner&price_from=10&price_to=50
 *   &price=20&status=published&sort=price_asc&page=1&limit=10
 */
const listCourses = [
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('category').optional().isMongoId().withMessage('Category filter must be a valid id'),
  query('instructor').optional().isMongoId().withMessage('Instructor filter must be a valid id'),
  query('level')
    .optional()
    .isIn(LEVELS)
    .withMessage(`Level must be one of: ${LEVELS.join(', ')}`),
  query('status')
    .optional()
    .isIn(STATUSES)
    .withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
  query('price').optional().isFloat({ min: 0 }).withMessage('price must be >= 0').toFloat(),
  query('price_from')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('price_from must be >= 0')
    .toFloat(),
  query('price_to').optional().isFloat({ min: 0 }).withMessage('price_to must be >= 0').toFloat(),
  query('sort')
    .optional()
    .isIn(['newest', 'oldest', 'price_asc', 'price_desc', 'title_asc', 'title_desc'])
    .withMessage('sort must be one of: newest, oldest, price_asc, price_desc, title_asc, title_desc'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
    .toInt(),
];

module.exports = { createCourse, updateCourse, listCourses, courseId, courseIdParam };
