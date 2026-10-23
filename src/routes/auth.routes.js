/**
 * ============================================================================
 *  🛣️  auth.routes.js  →  mounted at /api/auth
 * ============================================================================
 */
const express = require('express');
const {
  register,
  login,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
} = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const authValidators = require('../validators/auth.validator');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account (always role "student")
 *     description: |
 *       Creates a student account and returns a JWT immediately.
 *       **The role can not be chosen**: self-registration as teacher/admin is refused
 *       and an admin has to promote the account afterwards (PATCH /users/{id}).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: Long }
 *               email: { type: string, format: email, example: long@example.com }
 *               password: { type: string, minLength: 10, example: Password123 }
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { description: Too many failed attempts }
 */
router.post('/register', authLimiter, authValidators.register, validate, register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive a JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: long@example.com }
 *               password: { type: string, example: Password123 }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { description: Too many failed attempts }
 */
router.post('/login', authLimiter, authValidators.login, validate, login);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out (revokes every token issued so far)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 'Logged out (tokenVersion bumped)' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout', authenticate, logout);

/**
 * @openapi
 * /auth/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change the password of the logged-in user
 *     description: |
 *       Requires the current password. All existing tokens are revoked and a new
 *       token is returned for the current client.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, example: Password123 }
 *               newPassword: { type: string, minLength: 10, example: NewPassword456 }
 *     responses:
 *       200: { description: Password updated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.patch(
  '/password',
  authenticate,
  authLimiter,
  authValidators.changePassword,
  validate,
  changePassword
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset token
 *     description: |
 *       Always returns 200 with the same message (no account enumeration).
 *       In development the raw `resetToken` is included in the response; in
 *       production it is only sent by email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: long@example.com }
 *     responses:
 *       200: { description: Reset instructions sent (if the account exists) }
 *       429: { description: Too many attempts }
 */
router.post('/forgot-password', authLimiter, authValidators.forgotPassword, validate, forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using a reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string, example: 9f2c...64 hex characters }
 *               newPassword: { type: string, minLength: 10, example: NewPassword456 }
 *     responses:
 *       200: { description: Password reset (all previous sessions revoked) }
 *       400: { description: Invalid or expired reset token }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post('/reset-password', authLimiter, authValidators.resetPassword, validate, resetPassword);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the currently authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The logged-in user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', authenticate, getMe);

module.exports = router;
