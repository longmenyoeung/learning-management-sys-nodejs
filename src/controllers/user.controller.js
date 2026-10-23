/**
 * ============================================================================
 *  👤 user.controller.js — admin user management
 * ============================================================================
 *  💡 Every route here is mounted behind `authenticate + authorize('admin')`.
 * ============================================================================
 */
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { deleteUserCascade } = require('../utils/cascade');

/** 💡 Shared sort map so `?sort=` stays whitelisted and readable. */
const USER_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
};

/** Build the `{ page, limit, skip }` triple from validated query params. */
const paginate = (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100); // 💡 hard cap = 100
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * GET /api/users  (admin)
 * ---------------------------------------------------------------------------
 * 💡 Filters: ?role=teacher&isActive=true&search=long&sort=newest&page=1&limit=10
 */
const getUsers = asyncHandler(async (req, res) => {
  const { role, isActive, search, sort = 'newest' } = req.query;
  const { page, limit, skip } = paginate(req.query);

  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    // 💡 `$regex` + `$options: 'i'` = case-insensitive "contains" search.
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort(USER_SORTS[sort] || USER_SORTS.newest).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    count: users.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    data: users,
  });
});

/**
 * GET /api/users/:id  (admin)
 * 💡 Bonus info (courses taught / courses followed) comes from `countDocuments`.
 */
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const [coursesTaught, coursesFollowed] = await Promise.all([
    user.role === 'teacher' ? Course.countDocuments({ instructor: user._id }) : 0,
    user.role === 'student' ? Enrollment.countDocuments({ student: user._id }) : 0,
  ]);

  return res.json({
    success: true,
    data: user,
    meta: { coursesTaught, coursesFollowed },
  });
});

/**
 * PATCH /api/users/:id  (admin)
 * ---------------------------------------------------------------------------
 * 💡 Guards against the classic "admin locks everybody out" accident:
 *    an admin cannot change their own role and cannot deactivate themselves.
 */
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const { name, email, role, isActive, avatar } = req.body;
  const isSelf = String(user._id) === String(req.user._id);

  if (isSelf && role !== undefined && role !== user.role) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (isSelf && isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  // 💡 The unique index would also catch this, but a 409 with a clear message is nicer.
  if (email && email.toLowerCase() !== user.email) {
    const emailTaken = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
    if (emailTaken) throw ApiError.conflict('This email address is already used by another account');
  }

  // 💡 Whitelist: never trust `req.body` blindly (role/isActive are admin-only fields anyway).
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (role !== undefined) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (avatar !== undefined) user.avatar = avatar;

  await user.save(); // 💡 `save()` (not `findByIdAndUpdate`) keeps the schema validators + hooks

  return res.json({ success: true, message: 'User updated', data: user });
});

/**
 * DELETE /api/users/:id  (admin)
 * ---------------------------------------------------------------------------
 * 💡 Cascading delete: courses he teaches + enrollments/progress/reviews.
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const cascade = await deleteUserCascade(user._id);
  await user.deleteOne();

  return res.json({
    success: true,
    message: 'User and all related data deleted',
    data: cascade,
  });
});

module.exports = { getUsers, getUser, updateUser, deleteUser };
