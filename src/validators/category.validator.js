/**
 * ============================================================================
 *  📂 category.validator.js
 * ============================================================================
 */
const { body, param, query } = require('express-validator');

/** POST /api/categories */
const createCategory = [
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('Category name is required')
    .bail()
    .isString()
    .withMessage('Category name must be a string')
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Category name must be between 2 and 80 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
];

/** PATCH /api/categories/:id */
const updateCategory = [
  param('id').isMongoId().withMessage('Invalid category id'),
  body('name')
    .optional()
    .isString()
    .withMessage('Category name must be a string')
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('Category name must be between 2 and 80 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  body().custom((_value, { req }) => {
    if (req.body.name === undefined && req.body.description === undefined) {
      throw new Error('Provide at least one field to update (name, description)');
    }
    return true;
  }),
];

/** :id params */
const categoryId = [param('id').isMongoId().withMessage('Invalid category id')];

/** GET /api/categories query string */
const listCategories = [
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['newest', 'oldest', 'name_asc', 'name_desc']),
];

module.exports = { createCategory, updateCategory, categoryId, listCategories };
