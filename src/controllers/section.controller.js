/**
 * ============================================================================
 *  📖 section.controller.js
 * ============================================================================
 *  A section belongs to a course; only the course owner (teacher) or an admin
 *  may create / update / delete sections.
 *
 *  Routes:
 *    POST   /api/courses/:courseId/sections
 *    GET    /api/courses/:courseId/sections
 *    GET    /api/sections/:id
 *    PATCH  /api/sections/:id
 *    DELETE /api/sections/:id
 * ============================================================================
 */
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { deleteSectionCascade } = require('../utils/cascade');
const {
  findCourseOr404,
  assertCanManageCourse,
  findSectionOr404,
} = require('../utils/access');

/** 💡 Only the fields a lesson list needs — keeps the payload small. */
const LESSON_LIST_FIELDS = 'title description duration order videoUrl createdAt';

/**
 * POST /api/courses/:courseId/sections  (owner teacher | admin)
 * ---------------------------------------------------------------------------
 * 💡 If no `order` is provided the section is appended at the end of the course
 *    (`countDocuments + 1`), which is what a course builder UI expects.
 */
const createSection = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.courseId, { populate: false });
  assertCanManageCourse(req.user, course);

  const { title, description } = req.body;
  const order =
    req.body.order !== undefined
      ? req.body.order
      : (await Section.countDocuments({ course: course._id })) + 1;

  const section = await Section.create({
    course: course._id,
    title,
    description,
    order,
  });

  return res.status(201).json({
    success: true,
    message: 'Section created',
    data: { ...section.toObject(), lessonCount: 0 },
  });
});

/**
 * GET /api/courses/:courseId/sections  (public)
 * ---------------------------------------------------------------------------
 * 📊 Every section comes with its lessons (populated) and their count.
 * 💡 `sort({ order: 1 })` uses the `{ course: 1, order: 1 }` compound index.
 */
const getSectionsByCourse = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.courseId, { populate: false });

  const sections = await Section.find({ course: course._id })
    .sort({ order: 1, createdAt: 1 })
    .populate({ path: 'lessons', select: LESSON_LIST_FIELDS, options: { sort: { order: 1 } } })
    .lean();

  return res.json({
    success: true,
    count: sections.length,
    course: { id: course._id, title: course.title, status: course.status },
    data: sections.map((section) => ({
      ...section,
      lessonCount: section.lessons ? section.lessons.length : 0,
      totalDuration: section.lessons
        ? section.lessons.reduce((sum, lesson) => sum + (lesson.duration || 0), 0)
        : 0,
    })),
  });
});

/**
 * GET /api/sections/:id  (public)
 */
const getSection = asyncHandler(async (req, res) => {
  const section = await findSectionOr404(req.params.id);

  const lessons = await Lesson.find({ section: section._id })
    .select(`${LESSON_LIST_FIELDS} content`)
    .sort({ order: 1, createdAt: 1 })
    .lean();

  return res.json({
    success: true,
    data: { ...section.toObject(), lessonCount: lessons.length, lessons },
  });
});

/**
 * PATCH /api/sections/:id  (owner teacher | admin)
 * 💡 `findSectionOr404` also populates the parent course, which is what the
 *    ownership check needs (`section.course.instructor`).
 */
const updateSection = asyncHandler(async (req, res) => {
  const section = await findSectionOr404(req.params.id);
  assertCanManageCourse(req.user, section.course);

  const { title, description, order } = req.body;
  if (title !== undefined) section.title = title;
  if (description !== undefined) section.description = description;
  if (order !== undefined) section.order = order;

  await section.save();

  return res.json({ success: true, message: 'Section updated', data: section });
});

/**
 * DELETE /api/sections/:id  (owner teacher | admin)
 * ---------------------------------------------------------------------------
 * 💡 Cascading delete: the lessons of the section **and** the progress rows
 *    those lessons produced, so no student keeps "extra" completed lessons.
 */
const deleteSection = asyncHandler(async (req, res) => {
  const section = await findSectionOr404(req.params.id);
  assertCanManageCourse(req.user, section.course);

  const cascade = await deleteSectionCascade(section._id);

  return res.json({
    success: true,
    message: 'Section deleted together with its lessons and related progress',
    data: cascade,
  });
});

module.exports = {
  createSection,
  getSectionsByCourse,
  getSection,
  updateSection,
  deleteSection,
};
