/**
 * ============================================================================
 *  📚 course.controller.js
 * ============================================================================
 *  Endpoints:
 *    POST   /api/courses            teacher | admin
 *    GET    /api/courses            public  (search, filter, sort, paginate)
 *    GET    /api/courses/:id        public-ish (draft/archived only owner/admin)
 *    PATCH  /api/courses/:id        owner | admin
 *    DELETE /api/courses/:id        owner | admin   (cascading delete)
 * ============================================================================
 */
const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const Review = require('../models/Review');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { deleteCoursesCascade } = require('../utils/cascade');
const {
  findCourseOr404,
  isCourseOwner,
  assertCanManageCourse,
  getCourseLessonIds,
  POPULATE_INSTRUCTOR,
  POPULATE_CATEGORY,
} = require('../utils/access');

/** 💡 Whitelisted sort options for `GET /api/courses?sort=` */
const COURSE_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
};

/** Escape user input before building a RegExp (prevents regex injection). */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 🔎 Build the MongoDB filter from the query string.
 * ---------------------------------------------------------------------------
 * 💡 Kept in its own function: this endpoint is the busiest part of the API and
 *    isolating the filter rules makes them easy to read and test.
 *
 * Status visibility rules:
 *   • no `?status`      → only `published` courses (public catalogue)
 *   • `?status=draft`   → requires a logged-in teacher (own courses) or admin
 *   • students can never browse drafts/archives
 */
const buildCourseFilter = (query, user) => {
  const filter = {};
  const { search, category, instructor, level, price, price_from, price_to, status } = query;

  // ── status ────────────────────────────────────────────────────────────────
  if (status) {
    if (!user) {
      throw ApiError.unauthorized('Please log in to filter courses by status');
    }
    if (user.role === 'student') {
      throw ApiError.forbidden('Students can only browse published courses');
    }
    if (user.role === 'teacher' && status !== 'published') {
      if (instructor && String(instructor) !== String(user._id)) {
        throw ApiError.forbidden('Teachers can only list their own draft or archived courses');
      }
      filter.instructor = user._id; // 💡 a teacher only sees their own drafts
    }
    filter.status = status;
  } else {
    filter.status = 'published';
  }

  // ── search on title + description ─────────────────────────────────────────
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { description: rx }];
  }

  // ── direct filters ────────────────────────────────────────────────────────
  if (category) filter.category = category;
  if (level) filter.level = level;
  // 💡 Ignored when the status rule above already pinned the instructor.
  if (instructor && filter.instructor === undefined) filter.instructor = instructor;

  // ── price: exact value, or a range ($gte / $lte) ──────────────────────────
  if (price !== undefined) {
    filter.price = price;
  } else if (price_from !== undefined || price_to !== undefined) {
    if (price_from !== undefined && price_to !== undefined && price_from > price_to) {
      throw ApiError.badRequest('price_from cannot be greater than price_to');
    }
    filter.price = {};
    if (price_from !== undefined) filter.price.$gte = price_from;
    if (price_to !== undefined) filter.price.$lte = price_to;
  }

  return filter;
};
/**
 * ⭐ Attach `rating` / `reviewCount` to a list of courses.
 * 💡 ONE aggregation for the whole page instead of one query per course (avoids
 *    the classic N+1 query problem).
 * @param {Array<object>} courses - lean objects or Mongoose documents
 */
const attachRatings = async (courses) => {
  if (courses.length === 0) return [];

  const stats = await Review.getCourseRatingStats(courses.map((c) => c._id));

  return courses.map((course) => {
    const plain = typeof course.toObject === 'function' ? course.toObject() : course;
    const rating = stats[String(plain._id)] || { averageRating: 0, reviewCount: 0 };
    return { ...plain, rating: rating.averageRating, reviewCount: rating.reviewCount };
  });
};

/**
 * POST /api/courses  (teacher | admin)
 * ---------------------------------------------------------------------------
 * 💡 The instructor is always the authenticated user; only an admin may create
 *    a course on behalf of another teacher by sending `instructor`.
 */
const createCourse = asyncHandler(async (req, res) => {
  const { title, description, category, thumbnail, price, level, status, instructor } = req.body;

  const categoryExists = await Category.findById(category).select('_id name');
  if (!categoryExists) throw ApiError.notFound('Category not found');

  let instructorId = req.user._id;
  if (instructor && String(instructor) !== String(req.user._id)) {
    // ⚠️ Only an administrator can assign a course to somebody else.
    if (req.user.role !== 'admin') {
      throw ApiError.forbidden('Only an administrator can create a course for another instructor');
    }
    const teacher = await User.findById(instructor);
    if (!teacher) throw ApiError.notFound('Instructor not found');
    if (teacher.role === 'student') {
      throw ApiError.badRequest('The instructor of a course must be a teacher or an admin');
    }
    instructorId = teacher._id;
  }

  const course = await Course.create({
    title,
    description,
    category: categoryExists._id,
    instructor: instructorId,
    thumbnail,
    price,
    level,
    // 💡 A new course is a draft unless the client explicitly says otherwise.
    status: status || 'draft',
  });

  // 💡 populate() turns the instructor/category ids into full documents for the response.
  await course.populate([POPULATE_INSTRUCTOR, POPULATE_CATEGORY]);

  return res.status(201).json({
    success: true,
    message: 'Course created',
    data: { ...course.toObject(), rating: 0, reviewCount: 0 },
  });
});

/**
 * GET /api/courses  (public)
 * ---------------------------------------------------------------------------
 * Supported query parameters:
 *   ?search=node                 title + description (case-insensitive)
 *   ?category=<id>               filter by category
 *   ?instructor=<id>             filter by teacher
 *   ?level=beginner              beginner | intermediate | advanced
 *   ?price=20                    exact price
 *   ?price_from=10&price_to=50   price range
 *   ?status=published            draft | published | archived (teacher/admin only)
 *   ?sort=price_asc              newest | oldest | price_asc | price_desc | title_asc | title_desc
 *   ?page=2&limit=10             pagination
 */
const getCourses = asyncHandler(async (req, res) => {
  const { sort = 'newest' } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100); // 💡 hard cap

  const filter = buildCourseFilter(req.query, req.user);

  // 💡 find().populate().sort().skip().limit() + countDocuments() for the meta block.
  const [courses, total] = await Promise.all([
    Course.find(filter)
      .populate(POPULATE_INSTRUCTOR)
      .populate(POPULATE_CATEGORY)
      .sort(COURSE_SORTS[sort] || COURSE_SORTS.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(), // 💡 read-only endpoint → plain objects are faster
    Course.countDocuments(filter),
  ]);

  const data = await attachRatings(courses);

  return res.json({
    success: true,
    count: data.length, // documents in this page
    total, // documents matching the filter
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    hasNextPage: page * limit < total,
    data,
  });
});
/**
 * GET /api/courses/:id  (public for published courses)
 * ---------------------------------------------------------------------------
 * 💡 Drafts and archived courses are private: only the owner teacher or an
 *    admin may read them (403 otherwise), otherwise everybody could read the
 *    content of an unpublished course.
 * 💡 The response also contains course statistics (sections, lessons, students,
 *    rating) computed with countDocuments + aggregation.
 */
const getCourse = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.id);

  if (course.status !== 'published' && !isCourseOwner(req.user, course)) {
    throw ApiError.forbidden('This course is not published yet');
  }

  const [totalSections, lessonIds, totalStudents, rating, enrollmentBreakdown] = await Promise.all([
    Section.countDocuments({ course: course._id }),
    getCourseLessonIds(course._id),
    Enrollment.countDocuments({ course: course._id, status: { $ne: 'cancelled' } }),
    Review.getCourseRating(req.params.id),
    // 📊 Aggregation: how many students are currently active / already finished.
    Enrollment.aggregate([
      { $match: { course: course._id, status: { $ne: 'cancelled' } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const studentsByStatus = enrollmentBreakdown.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  return res.json({
    success: true,
    data: {
      ...course.toObject(),
      rating: rating.averageRating, // ⭐ average of all reviews (aggregation)
      reviewCount: rating.reviewCount,
      stats: {
        totalSections,
        totalLessons: lessonIds.length,
        totalStudents,
        activeStudents: studentsByStatus.active || 0,
        completedStudents: studentsByStatus.completed || 0,
      },
    },
  });
});

/**
 * PATCH /api/courses/:id  (owner teacher | admin)
 * ---------------------------------------------------------------------------
 * 💡 Two-step authorization: `authorize('teacher','admin')` in the route +
 *    `assertCanManageCourse()` here → Teacher B gets 403 on Teacher A's course.
 */
const updateCourse = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.id, { populate: false });
  assertCanManageCourse(req.user, course);

  const { title, description, category, thumbnail, price, level, status } = req.body;

  if (category !== undefined) {
    const categoryExists = await Category.findById(category).select('_id');
    if (!categoryExists) throw ApiError.notFound('Category not found');
    course.category = categoryExists._id;
  }

  // 💡 Whitelist assignment (never `Object.assign(course, req.body)`).
  if (title !== undefined) course.title = title;
  if (description !== undefined) course.description = description;
  if (thumbnail !== undefined) course.thumbnail = thumbnail;
  if (price !== undefined) course.price = price;
  if (level !== undefined) course.level = level;
  if (status !== undefined) course.status = status; // draft → published → archived

  await course.save(); // 💡 save() keeps schema validation + timestamps working
  await course.populate([POPULATE_INSTRUCTOR, POPULATE_CATEGORY]);

  const rating = await Review.getCourseRating(course._id);

  return res.json({
    success: true,
    message: 'Course updated',
    data: { ...course.toObject(), rating: rating.averageRating, reviewCount: rating.reviewCount },
  });
});

/**
 * DELETE /api/courses/:id  (owner teacher | admin)
 * ---------------------------------------------------------------------------
 * 💡 Cascading delete: sections, lessons, enrollments, progress rows, reviews.
 *    (MongoDB has no foreign keys, so the API must clean up itself.)
 */
const deleteCourse = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.id, { populate: false });
  assertCanManageCourse(req.user, course);

  const cascade = await deleteCoursesCascade([course._id]);

  return res.json({
    success: true,
    message: 'Course deleted together with its sections, lessons, enrollments and reviews',
    data: cascade,
  });
});

module.exports = { createCourse, getCourses, getCourse, updateCourse, deleteCourse };


