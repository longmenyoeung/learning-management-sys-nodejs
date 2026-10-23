/**
 * ============================================================================
 *  📝 lesson.controller.js
 * ============================================================================
 *  Routes:
 *    POST   /api/sections/:sectionId/lessons      owner teacher | admin
 *    GET    /api/sections/:sectionId/lessons      public (content gated)
 *    GET    /api/lessons/:id                      public (content gated)
 *    PATCH  /api/lessons/:id                      owner teacher | admin
 *    DELETE /api/lessons/:id                      owner teacher | admin
 *    POST   /api/lessons/:lessonId/complete       enrolled student
 *
 *  🔒 Content gating: lesson *titles* are public (so visitors can preview a
 *     course), but the `content` field is only returned to the course owner,
 *     to admins and to students with an active/completed enrollment.
 * ============================================================================
 */
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const {
  findSectionOr404,
  findLessonOr404,
  assertCanManageCourse,
  isCourseOwner,
} = require('../utils/access');
const { calculateCourseProgress, syncEnrollmentStatus } = require('../utils/progress');

/** Fields returned in a lesson list (content is added conditionally). */
const LESSON_LIST_FIELDS = 'title description duration order videoUrl createdAt';

/**
 * 🔒 Can this user read the full lesson content?
 * @param {object|undefined} user - `req.user` (may be undefined for visitors)
 * @param {object} course
 * @returns {Promise<boolean>}
 */
const canReadFullContent = async (user, course) => {
  if (!user) return false;
  if (isCourseOwner(user, course)) return true; // instructor or admin

  const enrollment = await Enrollment.findOne({
    student: user._id,
    course: course._id,
    status: { $in: ['active', 'completed'] },
  });
  return Boolean(enrollment);
};

/**
 * POST /api/sections/:sectionId/lessons  (owner teacher | admin)
 * 💡 `order` is auto-numbered inside the section when it is not provided.
 */
const createLesson = asyncHandler(async (req, res) => {
  const section = await findSectionOr404(req.params.sectionId);
  assertCanManageCourse(req.user, section.course);

  const order =
    req.body.order !== undefined
      ? req.body.order
      : (await Lesson.countDocuments({ section: section._id })) + 1;

  const lesson = await Lesson.create({
    section: section._id,
    title: req.body.title,
    description: req.body.description,
    content: req.body.content,
    videoUrl: req.body.videoUrl,
    duration: req.body.duration,
    order,
  });

  return res.status(201).json({ success: true, message: 'Lesson created', data: lesson });
});

/**
 * GET /api/sections/:sectionId/lessons  (public, content gated)
 * ---------------------------------------------------------------------------
 * 💡 `?search=middleware` filters by title, `?withContent=true` still only works
 *    when the caller is actually allowed to read the content.
 */
const getLessonsBySection = asyncHandler(async (req, res) => {
  const section = await findSectionOr404(req.params.sectionId);
  const { search } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  const filter = { section: section._id };
  if (search) {
    filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const access = await canReadFullContent(req.user, section.course);
  // ⚠️ The `content` field is only selected when the caller has access — it is
  //    never even loaded from MongoDB for visitors.
  const fields = access ? `${LESSON_LIST_FIELDS} content` : LESSON_LIST_FIELDS;

  const [lessons, total] = await Promise.all([
    Lesson.find(filter)
      .select(fields)
      .sort({ order: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lesson.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    count: lessons.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    hasAccessToContent: access,
    section: { id: section._id, title: section.title, course: section.course._id },
    data: lessons,
  });
});

/**
 * GET /api/lessons/:id  (public, content gated)
 */
const getLesson = asyncHandler(async (req, res) => {
  const lesson = await findLessonOr404(req.params.id);
  const course = lesson.section.course;

  if (course.status !== 'published' && !isCourseOwner(req.user, course)) {
    throw ApiError.forbidden('This course is not published yet');
  }

  const access = await canReadFullContent(req.user, course);
  const data = lesson.toObject();
  // ⚠️ Hide the lesson body from visitors / students who are not enrolled.
  if (!access) delete data.content;

  return res.json({
    success: true,
    hasAccessToContent: access,
    data,
  });
});
/**
 * PATCH /api/lessons/:id  (owner teacher | admin)
 */
const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await findLessonOr404(req.params.id);
  assertCanManageCourse(req.user, lesson.section.course);

  const { title, description, content, videoUrl, duration, order } = req.body;
  if (title !== undefined) lesson.title = title;
  if (description !== undefined) lesson.description = description;
  if (content !== undefined) lesson.content = content;
  if (videoUrl !== undefined) lesson.videoUrl = videoUrl;
  if (duration !== undefined) lesson.duration = duration;
  if (order !== undefined) lesson.order = order;

  await lesson.save();

  return res.json({ success: true, message: 'Lesson updated', data: lesson });
});

/**
 * DELETE /api/lessons/:id  (owner teacher | admin)
 * 💡 Also removes the Progress rows of this lesson, otherwise the course
 *    progress percentages of the students would still count a deleted lesson.
 */
const deleteLesson = asyncHandler(async (req, res) => {
  const lesson = await findLessonOr404(req.params.id);
  assertCanManageCourse(req.user, lesson.section.course);

  const progress = await Progress.deleteMany({ lesson: lesson._id });
  await lesson.deleteOne();

  return res.json({
    success: true,
    message: 'Lesson deleted',
    data: { deletedLesson: 1, deletedProgress: progress.deletedCount || 0 },
  });
});

/**
 * POST /api/lessons/:lessonId/complete  (enrolled student)
 * ===========================================================================
 *  ✅ The heart of the learning flow. The checks are executed in this order:
 *
 *     1. is the user logged in?              → authenticate middleware (401)
 *     2. does the lesson exist?              → 404
 *     3. is the lesson inside a course the student is enrolled in? → 403
 *     4. was the lesson already completed?   → 409 (no double counting)
 *     5. create the Progress row
 *     6. recalculate the course percentage
 *     7. progress === 100 → enrollment becomes "completed"
 *
 *  💡 Only *enrolled students* can complete lessons: a teacher cannot "complete"
 *     lessons of their own course, and neither can a visitor.
 * ===========================================================================
 */
const completeLesson = asyncHandler(async (req, res) => {
  const lesson = await findLessonOr404(req.params.lessonId);
  const course = lesson.section.course;

  // ── Rule: only students learn (teachers/admins never carry progress) ──────
  if (req.user.role !== 'student') {
    throw ApiError.forbidden('Only students can complete lessons');
  }

  // ── Rule: the student must be enrolled in the course of this lesson ───────
  // 💡 Checked with ONE query (`student + course + status`) instead of two, and
  //    it is what stops "complete a lesson of a course I never joined".
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: course._id,
    status: { $in: ['active', 'completed'] },
  });
  if (!enrollment) {
    throw ApiError.forbidden(
      'You cannot complete this lesson because you are not enrolled in this course'
    );
  }

  // ── Rule: complete the same lesson only once ──────────────────────────────
  // 💡 The unique index { student, course, lesson } would also reject this with
  //    a 11000 duplicate key error → we answer with a friendly 409 instead.
  const alreadyCompleted = await Progress.findOne({
    student: req.user._id,
    course: course._id,
    lesson: lesson._id,
  });
  if (alreadyCompleted) {
    throw ApiError.conflict('This lesson is already marked as completed');
  }

  // ── Everything checks out → record the completion ─────────────────────────
  await Progress.create({
    student: req.user._id,
    course: course._id,
    lesson: lesson._id,
    completed: true,
    completedAt: new Date(),
  });

  const stats = await calculateCourseProgress(req.user._id, course._id);
  // 💡 100 % → the enrollment switches to "completed" and gets a completedAt date.
  await syncEnrollmentStatus(req.user._id, course._id, stats);

  return res.status(201).json({
    success: true,
    message: stats.completed
      ? '🎉 Lesson completed — congratulations, you finished the whole course!'
      : 'Lesson completed',
    data: {
      lesson: { id: lesson._id, title: lesson.title },
      course: { id: course._id, title: course.title },
      totalLessons: stats.totalLessons,
      completedLessons: stats.completedLessons,
      progress: stats.progress,
      completed: stats.completed,
      nextLessonId: stats.nextLessonId, // 💡 handy for a "continue learning" button
    },
  });
});

module.exports = {
  createLesson,
  getLessonsBySection,
  getLesson,
  updateLesson,
  deleteLesson,
  completeLesson,
};

