/**
 * ============================================================================
 *  🔐 password.js — the shared password policy
 * ============================================================================
 *  Requirements (see src/config/security.js):
 *      • 10–72 characters (bcrypt ignores everything after 72 bytes)
 *      • at least one lowercase letter
 *      • at least one uppercase letter
 *      • at least one digit
 *
 *  💡 Used by register, change-password and reset-password so the three flows
 *     can never enforce different rules.
 * ============================================================================
 */
const { body } = require('express-validator');
const { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } = require('../config/security');

const PASSWORD_RULES_MESSAGE = `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters long and contain a lowercase letter, an uppercase letter and a digit`;

/**
 * Build a strong-password validator chain.
 * @param {string} [field='password']
 * @param {{ required?: boolean, label?: string }} [options]
 */
const strongPassword = (field = 'password', { required = true, label = 'Password' } = {}) => {
  const chain = body(field);

  if (required) {
    chain.exists({ checkFalsy: true }).withMessage(`${label} is required`).bail();
  } else {
    chain.optional();
  }

  return chain
    .isString()
    .withMessage(`${label} must be a string`)
    .bail()
    .isLength({ min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })
    .withMessage(`${label} must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`)
    .bail()
    .matches(/[a-z]/)
    .withMessage(`${label} must contain a lowercase letter`)
    .bail()
    .matches(/[A-Z]/)
    .withMessage(`${label} must contain an uppercase letter`)
    .bail()
    .matches(/\d/)
    .withMessage(`${label} must contain a digit`);
};

module.exports = { strongPassword, PASSWORD_RULES_MESSAGE };
