/**
 * ============================================================================
 *  🔐 auth.validator.js — register / login / password-management rules
 * ============================================================================
 *  💡 Validation happens *before* the controller, so controllers can assume the
 *     body is well-formed and only deal with business rules.
 *  💡 `normalizeEmail()` lowercases + trims the address at the edge of the app.
 *  💡 Every password field uses the shared `strongPassword()` policy so the
 *     register, change-password and reset-password flows stay in sync.
 * ============================================================================
 */
const { body } = require('express-validator');
const { strongPassword } = require('./password');

/** Email rule shared by every auth endpoint. */
const emailRule = () =>
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .bail()
    .normalizeEmail({ gmail_remove_dots: false });

/** POST /api/auth/register */
const register = [
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('Name is required')
    .bail()
    .isString()
    .withMessage('Name must be a string')
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters'),

  emailRule(),

  strongPassword('password'),

  // ⚠️ Self-registration as teacher/admin is refused: the controller always
  //    stores the role "student". Sending an explicit "student" is tolerated,
  //    anything else is rejected with a clear message.
  body('role')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['student'])
    .withMessage(
      'Role cannot be chosen at registration: new accounts are created as students (an admin can change the role afterwards)'
    ),
];

/** POST /api/auth/login */
const login = [
  emailRule(),

  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .bail()
    .isString()
    .withMessage('Password must be a string'),
];

/** PATCH /api/auth/password */
const changePassword = [
  body('currentPassword')
    .exists({ checkFalsy: true })
    .withMessage('Current password is required')
    .bail()
    .isString()
    .withMessage('Current password must be a string'),

  strongPassword('newPassword', { label: 'New password' }),

  body('newPassword').custom((value, { req }) => {
    if (value && value === req.body.currentPassword) {
      throw new Error('The new password must be different from the current password');
    }
    return true;
  }),
];

/** POST /api/auth/forgot-password */
const forgotPassword = [emailRule()];

/** POST /api/auth/reset-password */
const resetPassword = [
  body('token')
    .exists({ checkFalsy: true })
    .withMessage('Password reset token is required')
    .bail()
    .isString()
    .withMessage('Password reset token must be a string')
    .bail()
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid password reset token')
    .bail()
    .isHexadecimal()
    .withMessage('Invalid password reset token'),

  strongPassword('newPassword', { label: 'New password' }),
];

module.exports = { register, login, changePassword, forgotPassword, resetPassword };

