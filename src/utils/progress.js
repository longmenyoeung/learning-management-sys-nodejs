/**
 * ============================================================================
 *  📊 progress.js — the "learning flow" business logic
 * ============================================================================
 *  💡 The whole point of the LMS lives here:
 *
 *        section has many lessons
 *                 ↓
 *        student completes lessons  →  Progress documents
 *                 ↓
 *        completedLessons / totalLessons = progress %
 *                 ↓
 *        progress === 100  →  Enrollment.status = "completed"
 *
 *  💡 Progress documents are stored per lesson (one row = one completed lesson)
 *     because that is the only way to answer "which lessons did I finish?".
 *     The percentage itself is *derived*, never stored twice (single source of truth).
 * ============================================================================
 */
const Progress = require('../models/Progress');
const Enrollment = require('../models/Enrollment');
const { getCourseLessonIds } = require('./access');

/**
 * Calculate how far a student is inside a course.
 * @param {string} studentId
 * @param {string} courseId
 * @returns {Promise<{totalLessons:number, completedLessons:number, progress:number, completed:boolean, nextLessonId:string|null}>}
 */
const calculateCourseProgress = async (studentId, courseId) => {
  const lessonIds = await getCourseLessonIds(courseId);
  const totalLessons = lessonIds.length;

  // ⚠️ Only lessons that still exist in the course are counted, so removing a
  //    lesson correctly *lowers* the percentage instead of inflating it.
  const progressDocs = await Progress.find({
    student: studentId,
    course: courseId,
    lesson: { $in: lessonIds },
    completed: true,
  })
    .select('lesson')
    .lean();

  const completedLessons = progressDocs.length;
  const progress =
    totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

  const completedIds = new Set(progressDocs.map((p) => String(p.lesson)));
  const nextLessonId = lessonIds.find((id) => !completedIds.has(String(id))) || null;

  return {
    totalLessons,
    completedLessons,
    progress,
    completed: totalLessons > 0 && completedLessons >= totalLessons,
    nextLessonId: nextLessonId ? String(nextLessonId) : null,
  };
};

/**
 * Keep the Enrollment row in sync with the progress.
 * 💡 Progress 100 % → status "completed" + `completedAt` timestamp.
 *    (A lesson removed later rolls the enrollment back to "active".)
 * @param {string} studentId
 * @param {string} courseId
 * @param {object} stats - result of `calculateCourseProgress`
 * @returns {Promise<object|null>} the (possibly updated) enrollment
 */
const syncEnrollmentStatus = async (studentId, courseId, stats) => {
  const enrollment = await Enrollment.findOne({ student: studentId, course: courseId });
  if (!enrollment || enrollment.status === 'cancelled') return enrollment;

  if (stats.completed && enrollment.status !== 'completed') {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
    await enrollment.save();
  } else if (!stats.completed && enrollment.status === 'completed') {
    enrollment.status = 'active';
    enrollment.completedAt = null;
    await enrollment.save();
  }

  return enrollment;
};

module.exports = { calculateCourseProgress, syncEnrollmentStatus };
