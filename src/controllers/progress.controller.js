/**
 * ============================================================================
 *  📊 progress.controller.js — "how far am I in this course?"
 * ============================================================================
 *  Route:
 *    GET /api/courses/:courseId/progress
 *
 *  Response (from the brief):
 *    { "course": "Node.js REST API", "totalLessons": 20,
 *      "completedLessons": 12, "progress": 60, "completed": false }
 *
 *  💡 Who may read whose progress?
 *      • a student      → their own progress only (enrollment required)
 *      • the instructor → any student of their own course (?studentId=<id>)
 *      • an admin       → anybody
 * ============================================================================
 */
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { calculateCourseProgress } = require('../utils/progress');
const { findCourseOr404, isCourseOwner } = require('../utils/access');

/**
 * GET /api/courses/:courseId/progress
 * ---------------------------------------------------------------------------
 * Query parameters:
 *   ?studentId=<id>   read another student's progress (owner teacher | admin)
 *   ?details=true     include the per-lesson completion list
 */
const getCourseProgress = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.courseId, { populate: false });
  const { studentId, details } = req.query;

  // ── 1. Whose progress are we looking at? ──────────────────────────────────
  const isSelf = !studentId || String(studentId) === String(req.user._id);
  const targetStudentId = isSelf ? req.user._id : studentId;

  if (!isSelf) {
    // ⚠️ Teachers/admins may only inspect students of *their own* course.
    if (req.user.role === 'student' || !isCourseOwner(req.user, course)) {
      throw ApiError.forbidden(
        'You can only read your own progress (a teacher can read the progress of students of their own courses)'
      );
    }
  }

  // ── 2. If we look at ourselves, the enrollment must exist ─────────────────
  const enrollment = await Enrollment.findOne({
    student: targetStudentId,
    course: course._id,
  });

  if (isSelf && (!enrollment || enrollment.status === 'cancelled')) {
    throw ApiError.forbidden('You are not enrolled in this course');
  }
  if (!enrollment) {
    throw ApiError.notFound('This student is not enrolled in this course');
  }

  // ── 3. The progress numbers (shared helper used by the lesson completion) ──
  const stats = await calculateCourseProgress(targetStudentId, course._id);

  const data = {
    course: course.title, // 💡 as in the brief
    courseId: course._id,
    student: targetStudentId,
    enrollmentStatus: enrollment.status,
    enrolledAt: enrollment.enrolledAt,
    completedAt: enrollment.completedAt,
    totalLessons: stats.totalLessons,
    completedLessons: stats.completedLessons,
    progress: stats.progress, // 0..100
    completed: stats.completed, // true when progress === 100
    nextLessonId: stats.nextLessonId,
  };

  // ── 4. Optional per-lesson breakdown (?details=true) ──────────────────────
  if (details === 'true' || details === '1' || details === true) {
    //  $lookup-style join done in JS: sections → lessons + the completion set.
    const sections = await Section.find({ course: course._id }).sort({ order: 1 }).lean();
    const lessons = await Lesson.find({ section: { $in: sections.map((s) => s._id) } })
      .select('title section order duration')
      .sort({ order: 1 })
      .lean();
    const completedRows = await Progress.find({ student: targetStudentId, course: course._id })
      .select('lesson completedAt')
      .lean();

    const completedMap = new Map(completedRows.map((row) => [String(row.lesson), row.completedAt]));

    data.sections = sections.map((section) => ({
      id: section._id,
      title: section.title,
      order: section.order,
      lessons: lessons
        .filter((lesson) => String(lesson.section) === String(section._id))
        .map((lesson) => ({
          id: lesson._id,
          title: lesson.title,
          duration: lesson.duration,
          order: lesson.order,
          completed: completedMap.has(String(lesson._id)),
          completedAt: completedMap.get(String(lesson._id)) || null,
        })),
    }));
  }

  return res.json({ success: true, data });
});

module.exports = { getCourseProgress };
