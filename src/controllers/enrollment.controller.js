/**
 * ============================================================================
 *  🎓 enrollment.controller.js — the "Student joins a course" step
 * ============================================================================
 *  Routes:
 *    POST   /api/courses/:courseId/enroll      student only
 *    GET    /api/enrollments/me                student's own courses
 *    GET    /api/courses/:courseId/students    teacher | admin
 *    DELETE /api/courses/:courseId/enroll      student (or teacher/admin)
 *
 *  🚫 Enrollment business rules:
 *     1. a student cannot enroll twice in the same course      → 409
 *     2. only `published` courses can be enrolled in           → 400
 *     3. the instructor cannot enroll in their own course      → 403
 *     4. only students can enroll                              → 403
 * ============================================================================
 */
const Enrollment = require('../models/Enrollment');
const Progress = require('../models/Progress');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { calculateCourseProgress } = require('../utils/progress');
const {
  findCourseOr404,
  assertCanManageCourse,
  getCourseLessonIds,
  POPULATE_INSTRUCTOR,
  POPULATE_CATEGORY,
} = require('../utils/access');

/**
 * POST /api/courses/:courseId/enroll  (student only)
 * ---------------------------------------------------------------------------
 * 💡 Every rule from the brief is enforced here, in a readable order.
 */
const enrollInCourse = asyncHandler(async (req, res) => {
  // 🚫 Rule 4 — only students can enroll.
  if (req.user.role !== 'student') {
    throw ApiError.forbidden(
      `Only students can enroll in a course (your role: ${req.user.role}). Teachers manage their own courses instead.`
    );
  }

  const course = await findCourseOr404(req.params.courseId, { populate: false });

  // 🚫 Rule 2 — a draft or archived course cannot be joined.
  if (course.status !== 'published') {
    throw ApiError.badRequest(
      `This course cannot be enrolled in because its status is "${course.status}" (only published courses are open)`
    );
  }

  // 🚫 Rule 3 — a teacher cannot enroll in their own course.
  // 💡 The check is done on the id (not on the role) because admins also own
  //    courses and must not be able to join them as students.
  if (String(course.instructor) === String(req.user._id)) {
    throw ApiError.forbidden(
      'You are the instructor of this course, you cannot enroll in it as a student'
    );
  }

  // 🚫 Rule 1 — no duplicate enrollment.
  const existing = await Enrollment.findOne({ student: req.user._id, course: course._id });
  if (existing && existing.status !== 'cancelled') {
    throw ApiError.conflict('You are already enrolled in this course');
  }

  // 💡 Coming back after cancelling: reactivate the old row instead of inserting
  //    a second one (the unique index { student, course } would refuse it anyway).
  if (existing) {
    existing.status = 'active';
    existing.enrolledAt = new Date();
    existing.completedAt = null;
    await existing.save();

    return res.json({
      success: true,
      message: 'Welcome back! Your enrollment has been reactivated',
      data: existing,
    });
  }

  const enrollment = await Enrollment.create({
    student: req.user._id,
    course: course._id,
    status: 'active',
  });

  return res.status(201).json({
    success: true,
    message: 'Successfully enrolled in the course',
    data: enrollment,
  });
});
/**
 * GET /api/enrollments/me  (student)
 * ---------------------------------------------------------------------------
 * 💡 Every course comes with its live progress percentage so the "My courses"
 *    page of a student needs only a single request.
 * 💡 ?status=active|completed|cancelled — cancelled enrollments are hidden by default.
 */
const getMyEnrollments = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const filter = { student: req.user._id };
  filter.status = status || { $ne: 'cancelled' };

  const enrollments = await Enrollment.find(filter)
    .populate({
      path: 'course',
      populate: [POPULATE_INSTRUCTOR, POPULATE_CATEGORY],
    })
    .sort({ createdAt: -1 })
    .lean();

  // ⚠️ A course deleted outside of the cascade could leave a null reference.
  const validEnrollments = enrollments.filter((enrollment) => enrollment.course);

  const data = await Promise.all(
    validEnrollments.map(async (enrollment) => {
      const stats = await calculateCourseProgress(req.user._id, enrollment.course._id);
      return {
        ...enrollment,
        progress: stats.progress,
        totalLessons: stats.totalLessons,
        completedLessons: stats.completedLessons,
        nextLessonId: stats.nextLessonId, // "continue learning" link
      };
    })
  );

  return res.json({ success: true, count: data.length, data });
});

/**
 * GET /api/courses/:courseId/students  (owner teacher | admin)
 * ---------------------------------------------------------------------------
 * 📊 Shows every enrolled student with their progress percentage.
 * 💡 The percentages come from ONE aggregation over the Progress collection
 *    (grouped by student) instead of N queries — one query per page.
 */
const getCourseStudents = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.courseId, { populate: false });
  assertCanManageCourse(req.user, course);

  const { status } = req.query;
  const enrollmentFilter = { course: course._id, status: status || { $ne: 'cancelled' } };

  const [enrollments, lessonIds, progressByStudent] = await Promise.all([
    Enrollment.find(enrollmentFilter)
      .populate({ path: 'student', select: 'name email avatar role isActive' })
      .sort({ createdAt: -1 })
      .lean(),
    getCourseLessonIds(course._id),
    Progress.aggregate([
      { $match: { course: course._id, completed: true } },
      { $group: { _id: '$student', completedLessons: { $sum: 1 } } },
    ]),
  ]);

  const completedMap = progressByStudent.reduce((acc, row) => {
    acc[String(row._id)] = row.completedLessons;
    return acc;
  }, {});

  const totalLessons = lessonIds.length;

  const data = enrollments
    .filter((enrollment) => enrollment.student) // ignore students whose account was deleted
    .map((enrollment) => {
      const completedLessons = completedMap[String(enrollment.student._id)] || 0;
      return {
        enrollmentId: enrollment._id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        student: enrollment.student,
        completedLessons,
        totalLessons,
        progress: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      };
    });

  return res.json({ success: true, count: data.length, totalLessons, data });
});

/**
 * DELETE /api/courses/:courseId/enroll
 * ---------------------------------------------------------------------------
 * 💡 Two use cases with one endpoint:
 *      • a student cancels their own enrollment
 *      • the course owner / an admin removes a student (?studentId=<userId>)
 * 💡 The row is *cancelled*, not deleted: this keeps the history and the
 *    Progress documents so the student can resume where they stopped if they
 *    enroll again. Use ?status=cancelled to see those rows.
 */
const cancelEnrollment = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.courseId, { populate: false });

  const isStudent = req.user.role === 'student';
  const targetStudentId = req.query.studentId || req.body?.studentId || req.user._id;

  // 🚫 A student can only cancel their own enrollment.
  if (!isStudent) {
    assertCanManageCourse(req.user, course);
    if (!targetStudentId || String(targetStudentId) === String(req.user._id)) {
      throw ApiError.badRequest(
        'Provide the id of the student to remove, e.g. ?studentId=<userId>'
      );
    }
  }

  const enrollment = await Enrollment.findOne({
    student: targetStudentId,
    course: course._id,
  });
  if (!enrollment) throw ApiError.notFound('Enrollment not found');
  if (enrollment.status === 'cancelled') {
    throw ApiError.conflict('This enrollment has already been cancelled');
  }

  enrollment.status = 'cancelled';
  enrollment.completedAt = null;
  await enrollment.save();

  return res.json({
    success: true,
    message: isStudent
      ? 'Your enrollment has been cancelled'
      : 'The student has been removed from this course',
    data: enrollment,
  });
});

module.exports = { enrollInCourse, getMyEnrollments, getCourseStudents, cancelEnrollment };

