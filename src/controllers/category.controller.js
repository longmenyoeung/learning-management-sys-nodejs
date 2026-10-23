/**
 * ============================================================================
 *  📂 category.controller.js
 * ============================================================================
 *  Read endpoints are public, write endpoints are admin-only
 *  (`authorize('admin')` is applied in category.routes.js).
 * ============================================================================
 */
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const CATEGORY_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
};

/**
 * 📊 Aggregation: number of courses per category.
 * 💡 `$lookup` joins the courses collection, `$addFields` + `$size` counts them.
 *    Used when returning categories so the client does not have to ask N times.
 */
const countCoursesPerCategory = async (categoryIds) => {
  const ids = categoryIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  if (ids.length === 0) return {};

  const rows = await Course.aggregate([
    { $match: { category: { $in: ids } } },
    { $group: { _id: '$category', total: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } } } },
  ]);

  return rows.reduce((acc, row) => {
    acc[String(row._id)] = { courseCount: row.total, publishedCourseCount: row.published };
    return acc;
  }, {});
};

/**
 * POST /api/categories  (admin)
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  const existing = await Category.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (existing) throw ApiError.conflict('A category with this name already exists');

  const category = await Category.create({ name, description });

  return res.status(201).json({ success: true, message: 'Category created', data: category });
});

/**
 * GET /api/categories  (public)
 * 💡 Supports ?search=&sort=&page=&limit= and returns `courseCount` per category.
 */
const getCategories = asyncHandler(async (req, res) => {
  const { search, sort = 'name_asc' } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  const filter = {};
  if (search) {
    filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const [categories, total] = await Promise.all([
    Category.find(filter)
      .sort(CATEGORY_SORTS[sort] || CATEGORY_SORTS.name_asc)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Category.countDocuments(filter),
  ]);

  const courseCounts = await countCoursesPerCategory(categories.map((c) => c._id));

  return res.json({
    success: true,
    count: categories.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    data: categories.map((category) => ({
      ...category,
      ...(courseCounts[String(category._id)] || { courseCount: 0, publishedCourseCount: 0 }),
    })),
  });
});

/**
 * GET /api/categories/:id  (public)
 * 💡 Shows the category together with its courses (populated via the virtual).
 */
const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const courseCounts = await countCoursesPerCategory([category._id]);

  return res.json({
    success: true,
    data: { ...category.toObject(), ...(courseCounts[String(category._id)] || { courseCount: 0 }) },
  });
});

/**
 * PATCH /api/categories/:id  (admin)
 */
const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const { name, description } = req.body;

  if (name && name.toLowerCase() !== category.name.toLowerCase()) {
    const taken = await Category.findOne({
      name: new RegExp(`^${name}$`, 'i'),
      _id: { $ne: category._id },
    });
    if (taken) throw ApiError.conflict('A category with this name already exists');
    category.name = name;
  }
  if (description !== undefined) category.description = description;

  await category.save();

  return res.json({ success: true, message: 'Category updated', data: category });
});

/**
 * DELETE /api/categories/:id  (admin)
 * ---------------------------------------------------------------------------
 * 💡 Business rule: a category that still contains courses cannot be deleted
 *    (409 Conflict). The admin must move or delete the courses first — this
 *    prevents orphaned courses pointing at a missing category.
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const coursesInCategory = await Course.countDocuments({ category: category._id });
  if (coursesInCategory > 0) {
    throw ApiError.conflict(
      `This category cannot be deleted because ${coursesInCategory} course(s) still use it. Move or delete them first.`
    );
  }

  await category.deleteOne();

  return res.json({ success: true, message: 'Category deleted' });
});

module.exports = { createCategory, getCategories, getCategory, updateCategory, deleteCategory };
