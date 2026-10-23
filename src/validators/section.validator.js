/**
 * ============================================================================
 *  📖 section.validator.js
 * ============================================================================
 *  💡 `order` is optional: when it is missing the controller appends the new
 *     section at the end of the course automatically.
 * ============================================================================
 */
const { body, param } = require('express-validator');

/** POST /api/courses/:courseId/sections */
const createSection = [
  param('courseId').isMongoId().withMessage('Invalid course id'),
  body('title')
    .exists({ checkFalsy: true })
    .withMessage('Section title is required')
    .bail()
    .isString()
    .withMessage('Title must be a string')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Title must be between 2 and 150 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be at most 1000 characters'),
  body('order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Order must be an integer greater than or equal to 0')
    .toInt(),
];

/** PATCH /api/sections/:id */
const updateSection = [
  param('id').isMongoId().withMessage('Invalid section id'),
  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string')
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage('Title must be between 2 and 150 characters'),
  body('description').optional().isString().trim().isLength({ max: 1000 }),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be >= 0').toInt(),
  body().custom((_value, { req }) => {
    if (['title', 'description', 'order'].every((field) => req.body[field] === undefined)) {
      throw new Error('Provide at least one field to update (title, description, order)');
    }
    return true;
  }),
];

/** :id (used by GET / PATCH / DELETE /api/sections/:id) */
const sectionId = [param('id').isMongoId().withMessage('Invalid section id')];

/** :sectionId (used by the nested lesson routes) */
const sectionIdParam = [param('sectionId').isMongoId().withMessage('Invalid section id')];

/** :courseId (used by the nested section routes: /api/courses/:courseId/sections) */
const courseIdParam = [param('courseId').isMongoId().withMessage('Invalid course id')];

module.exports = { createSection, updateSection, sectionId, sectionIdParam, courseIdParam };
