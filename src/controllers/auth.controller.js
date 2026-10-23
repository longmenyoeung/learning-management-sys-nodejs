/**
 * ============================================================================
 *  🔐 auth.controller.js — register / login / me / logout / password management
 * ============================================================================
 */
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { generateToken } = require('../utils/generateToken');
const { createResetToken, hashToken } = require('../utils/resetToken');
const { PASSWORD_RESET_TTL_MS } = require('../config/security');
const { isProduction } = require('../config/env');

/**
 * POST /api/auth/register
 * ---------------------------------------------------------------------------
 * 💡 Security decision: the role is **forced to "student"**. Nobody can promote
 *    themselves to teacher/admin through the public endpoint; only an admin can
 *    change a role (PATCH /api/users/:id).
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // 💡 Friendly 409 before MongoDB raises its own duplicate-key error.
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = await User.create({ name, email, password, role: 'student' });

  const token = generateToken(user);

  return res.status(201).json({
    success: true,
    message: 'Registration successful',
    token,
    user: user.toAuthJSON(), // { id, name, email, role, avatar, isActive }
  });
});

/**
 * POST /api/auth/login
 * ---------------------------------------------------------------------------
 * 💡 `select('+password +tokenVersion')` is required because the schema hides
 *    both fields by default. The token version must be selected, otherwise every
 *    login would sign `tv: 0` and a user who logged out could never log in again.
 * 💡 The error message is intentionally generic so it cannot be used to discover
 *    which emails are registered.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password +tokenVersion');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    // 💡 403 (not 401): the credentials are correct, the account is disabled.
    throw ApiError.forbidden('This account has been deactivated, please contact an administrator');
  }

  const token = generateToken(user);

  return res.json({
    success: true,
    message: 'Login successful',
    token,
    user: user.toAuthJSON(),
  });
});

/**
 * POST /api/auth/logout
 * ---------------------------------------------------------------------------
 * 💡 Stateless JWTs cannot be deleted, so we bump `tokenVersion` instead. Every
 *    token signed before this request becomes invalid immediately (all devices).
 * 💡 `updateOne` + `$inc` is atomic and needs no document validation.
 */
const logout = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });

  return res.json({
    success: true,
    message: 'Logged out. All previously issued tokens are now invalid.',
  });
});

/**
 * PATCH /api/auth/password
 * ---------------------------------------------------------------------------
 * 💡 Requires the current password (so a stolen token alone cannot lock the
 *    owner out) and revokes every existing session by bumping `tokenVersion` in
 *    the pre-save hook. A fresh token is returned so the current client stays
 *    logged in.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // 💡 `+tokenVersion` is essential: the pre-save hook increments it and an
  //    unselected value would reset the counter to 1 (potentially re-validating
  //    very old tokens).
  const user = await User.findById(req.user._id).select('+password +tokenVersion');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('The new password must be different from the current password');
  }

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  return res.json({
    success: true,
    message: 'Password updated. All other sessions have been signed out.',
    token: generateToken(user),
    user: user.toAuthJSON(),
  });
});

/**
 * POST /api/auth/forgot-password
 * ---------------------------------------------------------------------------
 * 💡 Always answers with the same message (account-enumeration resistance), no
 *    matter whether the email exists, is deactivated or is unknown.
 * 💡 Only the SHA-256 hash of the token is stored (15 minute TTL, single use).
 * 💡 There is no email provider in this project: in development the raw token
 *    is returned in the response so the flow is testable. In production it is
 *    *never* included — wire up an email service and send `resetUrl` instead.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email });

  const response = {
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent.',
  };

  if (!user || !user.isActive) return res.json(response);

  const { token, hashedToken } = createResetToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  // 💡 Targeted update: no document validation, no required-field problems.
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordResetToken: hashedToken, passwordResetExpires: expiresAt } }
  );

  if (isProduction()) {
    // 🔌 TODO: send the token by email. Never log it and never return it here.
    console.info('ℹ️  Password reset token generated — configure an email provider to deliver it.');
  } else {
    response.resetToken = token;
    response.expiresInMinutes = PASSWORD_RESET_TTL_MS / 60000;
    response.note = 'Development only. In production the token is emailed and never returned by the API.';
  }

  return res.json(response);
});

/**
 * POST /api/auth/reset-password
 * ---------------------------------------------------------------------------
 * 💡 The token is looked up by its hash, must not be expired, and is cleared
 *    after use (single use). The new password also bumps `tokenVersion`, so all
 *    existing sessions are revoked.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  const user = await User.findOne({
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+password +tokenVersion +passwordResetToken +passwordResetExpires');

  // 💡 Same message for "unknown", "already used" and "expired" tokens.
  if (!user) throw ApiError.badRequest('Invalid or expired password reset token');
  if (!user.isActive) throw ApiError.badRequest('Invalid or expired password reset token');

  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return res.json({
    success: true,
    message: 'Password reset successful. Please log in with your new password.',
    token: generateToken(user),
    user: user.toAuthJSON(),
  });
});

/**
 * GET /api/auth/me
 * ---------------------------------------------------------------------------
 * 💡 `req.user` was loaded by the `authenticate` middleware (fresh from MongoDB).
 */
const getMe = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    data: req.user.toAuthJSON(),
  })
);

module.exports = {
  register,
  login,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
};
