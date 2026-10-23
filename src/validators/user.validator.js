/**
 * ============================================================================
 *  👤 user.validator.js — admin user management rules
 * ============================================================================
 */
const { body, param, query } = require('express-validator');
const { ROLES } = require('../models/User');

/** :id must be a valid Mongo ObjectId (otherwise the CastError → 400). */
const userId = [param('id').isMongoId().withMessage('Invalid user id')];

/** GET /api/users query string */
const listUsers = [
  query('role').optional().isIn(ROLES).withMessage(`Role must be one of: ${ROLES.join(', ')}`),
  query('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
    .toInt(),
  query('sort')
    .optional()
    .isIn(['newest', 'oldest', 'name_asc', 'name_desc'])
    .withMessage('sort must be one of: newest, oldest, name_asc, name_desc'),
];

/** PATCH /api/users/:id — every field is optional, at least one is required. */
const updateUser = [
  param('id').isMongoId().withMessage('Invalid user id'),
  body('name')
    .optional()
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail({ gmail_remove_dots: false }),
  body('role')
    .optional()
    .isIn(ROLES)
    .withMessage(`Role must be one of: ${ROLES.join(', ')}`),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  body('avatar')
    .optional()
    .isString()
    .withMessage('Avatar must be a URL string')
    .trim()
    .isLength({ max: 500 }),
  // 💡 An empty PATCH body would silently do nothing → explicit 422 instead.
  body().custom((_value, { req }) => {
    const allowed = ['name', 'email', 'role', 'isActive', 'avatar'];
    if (!allowed.some((field) => req.body[field] !== undefined)) {
      throw new Error(`Provide at least one field to update (${allowed.join(', ')})`);
    }
    return true;
  }),
];

module.exports = { userId, listUsers, updateUser };
