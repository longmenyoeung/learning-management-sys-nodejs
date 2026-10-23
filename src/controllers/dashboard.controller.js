/**
 * ============================================================================
 *  📊 dashboard.controller.js — statistics for the three roles
 * ============================================================================
 *  This is the "aggregation playground" of the project:
 *
 *    GET /api/dashboard/student   → my courses, completed, average progress
 *    GET /api/dashboard/teacher   → my courses + students + ratings + completion
 *    GET /api/dashboard/admin     → platform wide counters
 *
 *  💡 Every number is computed from the database at request time (never stored),
 *     so the dashboards can never show stale statistics.
 * ============================================================================
 */
const User = require('../models/User');
const Course = require('../models/Course');
const Category = require('../models/Category');
const Enrollment = require('../models/Enrollment');
const Review = require('../models/Review');
const asyncHandler = require('../utils/asyncHandler');
const { calculateCourseProgress } = require('../utils/progress');

/**
 * GET /api/dashboard/student  (student)
 * ---------------------------------------------------------------------------
 * 💡 Example response from the brief:
 *   { "totalCourses": 5, "completedCourses": 2,
 *     "inProgressCourses": 3, "averageProgress": 68 }
 */
const getStudentDashboard = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ student: req.user._id })
    .populate({ path: 'course', select: 'title thumbnail price level status' })
    .lean();

  const active = enrollments.filter((e) => e.course && e.status !== 'cancelled');

  // 💡 The live percentage of every course (same helper the lesson completion uses).
  const progressList = await Promise.all(
    active.map((enrollment) => calculateCourseProgress(req.user._id, enrollment.course._id))
  );

  const completedCourses = active.filter((e) => e.status === 'completed').length;
  const inProgressCourses = active.filter((e) => e.status === 'active').length;
  const averageProgress =
    progressList.length === 0
      ? 0
      : Math.round(progressList.reduce((sum, p) => sum + p.progress, 0) / progressList.length);

  return res.json({
    success: true,
    data: {
      totalCourses: active.length,
      completedCourses,
      inProgressCourses,
      cancelledCourses: enrollments.length - active.length,
      averageProgress,
      totalCompletedLessons: progressList.reduce((sum, p) => sum + p.completedLessons, 0),
      // 💡 Ready-to-render list for a "continue learning" section.
      courses: active.map((enrollment, index) => ({
        enrollmentId: enrollment._id,
        courseId: enrollment.course._id,
        title: enrollment.course.title,
        thumbnail: enrollment.course.thumbnail,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        progress: progressList[index].progress,
        completedLessons: progressList[index].completedLessons,
        totalLessons: progressList[index].totalLessons,
        nextLessonId: progressList[index].nextLessonId,
      })),
    },
  });
});
/**
 * GET /api/dashboard/teacher  (teacher | admin)
 * ---------------------------------------------------------------------------
 * 💡 Example response from the brief:
 *   { "totalCourses": 5, "totalStudents": 250, "totalEnrollments": 320 }
 *    + one row per course with students, rating and completion rate.
 * 💡 The per-course numbers come from a single `$facet`/`$group` aggregation
 *    over the enrollments collection — no loop over the courses.
 */
const getTeacherDashboard = asyncHandler(async (req, res) => {
  // 💡 An admin sees the whole platform, a teacher only their own courses.
  const courseFilter = req.user.role === 'admin' ? {} : { instructor: req.user._id };

  const courses = await Course.find(courseFilter)
    .select('title status price level createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const courseIds = courses.map((course) => course._id);

  if (courseIds.length === 0) {
    return res.json({
      success: true,
      data: {
        totalCourses: 0,
        totalStudents: 0,
        totalEnrollments: 0,
        totalPublishedCourses: 0,
        courses: [],
      },
    });
  }

  // ── 📊 Aggregations (all in parallel) ─────────────────────────────────────
  const [enrollmentStats, ratingStats, studentIds] = await Promise.all([
    // 1️⃣ enrollments grouped per course + status breakdown
    Enrollment.aggregate([
      { $match: { course: { $in: courseIds }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$course',
          enrollments: { $sum: 1 },
          completedStudents: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          activeStudents: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          lastEnrollmentAt: { $max: '$enrolledAt' },
        },
      },
    ]),
    // 2️⃣ average rating + review count per course
    Review.getCourseRatingStats(courseIds),
    // 3️⃣ "how many different students do I teach?" → distinct
    Enrollment.distinct('student', { course: { $in: courseIds }, status: { $ne: 'cancelled' } }),
  ]);

  const enrollmentMap = enrollmentStats.reduce((acc, row) => {
    acc[String(row._id)] = row;
    return acc;
  }, {});

  const perCourse = courses.map((course) => {
    const stats = enrollmentMap[String(course._id)] || {
      enrollments: 0,
      completedStudents: 0,
      activeStudents: 0,
      lastEnrollmentAt: null,
    };
    const rating = ratingStats[String(course._id)] || { averageRating: 0, reviewCount: 0 };

    return {
      id: course._id,
      title: course.title,
      status: course.status,
      price: course.price,
      level: course.level,
      students: stats.enrollments,
      activeStudents: stats.activeStudents,
      completedStudents: stats.completedStudents,
      rating: rating.averageRating, // ⭐ e.g. 4.6
      reviewCount: rating.reviewCount,
      // 📈 completion rate = finished students / enrolled students
      completionRate:
        stats.enrollments === 0
          ? 0
          : Math.round((stats.completedStudents / stats.enrollments) * 100),
      lastEnrollmentAt: stats.lastEnrollmentAt,
    };
  });

  const totalEnrollments = perCourse.reduce((sum, course) => sum + course.students, 0);

  return res.json({
    success: true,
    data: {
      totalCourses: courses.length,
      totalPublishedCourses: courses.filter((course) => course.status === 'published').length,
      totalStudents: studentIds.length, // 👥 unique students
      totalEnrollments, // 📚 enrollments (a student can be in several courses)
      averageCompletionRate:
        perCourse.length === 0
          ? 0
          : Math.round(
              perCourse.reduce((sum, course) => sum + course.completionRate, 0) / perCourse.length
            ),
      courses: perCourse,
    },
  });
});
/**
 * GET /api/dashboard/admin  (admin)
 * ---------------------------------------------------------------------------
 * 💡 Example response from the brief:
 *   { "users": 1000, "teachers": 80, "students": 900,
 *     "courses": 150, "categories": 20, "enrollments": 5000 }
 *
 * 💡 One `$facet` aggregation per collection computes every counter in a single
 *    round trip: users (by role / active), courses (by status), enrollments
 *    (by status) and the top-rated courses.
 */
const getAdminDashboard = asyncHandler(async (req, res) => {
  const [userFacet, courseFacet, enrollmentFacet, categoryCount, topCourses] = await Promise.all([
    // ── 👥 users ────────────────────────────────────────────────────────────
    User.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byRole: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
          active: [{ $match: { isActive: true } }, { $count: 'count' }],
          recent: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            { $project: { name: 1, email: 1, role: 1, createdAt: 1 } },
          ],
        },
      },
    ]),
    // ── 📚 courses ──────────────────────────────────────────────────────────
    Course.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byLevel: [{ $group: { _id: '$level', count: { $sum: 1 } } }],
          // 💰 total value of the catalogue (price of every course)
          totalCatalogValue: [{ $group: { _id: null, sum: { $sum: '$price' } } }],
          averagePrice: [{ $group: { _id: null, avg: { $avg: '$price' } } }],
        },
      },
    ]),
    // ── 🎓 enrollments ──────────────────────────────────────────────────────
    Enrollment.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
    ]),
    Category.countDocuments(),
    // ── ⭐ top rated courses (aggregation with $lookup) ──────────────────────
    Review.aggregate([
      {
        $group: {
          _id: '$course',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
      { $match: { reviewCount: { $gte: 1 } } },
      { $sort: { averageRating: -1, reviewCount: -1 } },
      { $limit: 5 },
      // 💡 $lookup = "JOIN" the course document behind the review
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'course',
        },
      },
      { $unwind: '$course' },
      {
        $project: {
          _id: 0,
          courseId: '$_id',
          title: '$course.title',
          status: '$course.status',
          averageRating: { $round: ['$averageRating', 1] },
          reviewCount: 1,
        },
      },
    ]),
  ]);

  const roleCounts = (userFacet[0].byRole || []).reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const courseStatusCounts = (courseFacet[0].byStatus || []).reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const courseLevelCounts = (courseFacet[0].byLevel || []).reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const enrollmentStatusCounts = (enrollmentFacet[0].byStatus || []).reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  return res.json({
    success: true,
    data: {
      // ── flat counters exactly as in the brief ─────────────────────────────
      users: userFacet[0].total[0]?.count || 0,
      teachers: roleCounts.teacher || 0,
      students: roleCounts.student || 0,
      admins: roleCounts.admin || 0,
      courses: courseFacet[0].total[0]?.count || 0,
      categories: categoryCount,
      enrollments: enrollmentFacet[0].total[0]?.count || 0,
      // ── extra detail ──────────────────────────────────────────────────────
      inactiveUsers: (userFacet[0].total[0]?.count || 0) - (userFacet[0].active[0]?.count || 0),
      publishedCourses: courseStatusCounts.published || 0,
      draftCourses: courseStatusCounts.draft || 0,
      archivedCourses: courseStatusCounts.archived || 0,
      coursesByLevel: courseLevelCounts,
      activeEnrollments: enrollmentStatusCounts.active || 0,
      completedEnrollments: enrollmentStatusCounts.completed || 0,
      cancelledEnrollments: enrollmentStatusCounts.cancelled || 0,
      totalCatalogValue: Math.round((courseFacet[0].totalCatalogValue[0]?.sum || 0) * 100) / 100,
      averageCoursePrice:
        Math.round((courseFacet[0].averagePrice[0]?.avg || 0) * 100) / 100,
      topRatedCourses: topCourses,
      latestUsers: userFacet[0].recent || [],
    },
  });
});

module.exports = { getStudentDashboard, getTeacherDashboard, getAdminDashboard };


