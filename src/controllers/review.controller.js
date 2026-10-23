/**
 * ============================================================================
 *  ⭐ review.controller.js
 * ============================================================================
 *  Routes:
 *    POST   /api/courses/:courseId/reviews   enrolled student
 *    GET    /api/courses/:courseId/reviews   public
 *    PATCH  /api/reviews/:id                 review author | admin
 *    DELETE /api/reviews/:id                 review author | admin
 *
 *  Rules: logged in + enrolled + one review per student per course + rating 1-5.
 * ============================================================================
 */
const Review = require('../models/Review');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { findCourseOr404 } = require('../utils/access');

/** 💡 Whitelisted sort options for the review list. */
const REVIEW_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  rating_desc: { rating: -1 },
  rating_asc: { rating: 1 },
};

/**
 * POST /api/courses/:courseId/reviews  (enrolled student)
 * ---------------------------------------------------------------------------
 * 💡 "Must have access to the course" = an active or completed enrollment.
 * 💡 The unique index { student, course } guarantees one review per student.
 */
const createReview = asyncHandler(async (req, res) => {
  if (req.user.role !== 'student') {
    throw ApiError.forbidden('Only students can review a course');
  }

  const course = await findCourseOr404(req.params.courseId, { populate: false });

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: course._id,
    status: { $in: ['active', 'completed'] },
  });
  if (!enrollment) {
    throw ApiError.forbidden('You must be enrolled in this course before reviewing it');
  }

  // 💡 Friendly 409 before MongoDB raises the duplicate key error (11000).
  const existing = await Review.findOne({ student: req.user._id, course: course._id });
  if (existing) {
    throw ApiError.conflict(
      'You have already reviewed this course (use PATCH /api/reviews/:id to update it)'
    );
  }

  const review = await Review.create({
    student: req.user._id,
    course: course._id,
    rating: req.body.rating, // 💡 express-validator already guarantees an integer 1..5
    comment: req.body.comment,
  });

  await review.populate({ path: 'student', select: 'name avatar' });

  const ratingStats = await Review.getCourseRating(course._id);

  return res.status(201).json({
    success: true,
    message: 'Thank you for your review',
    data: review,
    meta: { courseRating: ratingStats.averageRating, reviewCount: ratingStats.reviewCount },
  });
});

/**
 * GET /api/courses/:courseId/reviews  (public)
 * ---------------------------------------------------------------------------
 * 📊 Returns the paginated reviews **plus** the rating summary (average + count
 *    + how many 1★/2★/... reviews) computed with MongoDB aggregations.
 */
const getCourseReviews = asyncHandler(async (req, res) => {
  const course = await findCourseOr404(req.params.courseId, { populate: false });
  const { rating, sort = 'newest' } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

  const filter = { course: course._id };
  if (rating) filter.rating = rating; // ?rating=5 → only five-star reviews

  const [reviews, total, summary, distribution] = await Promise.all([
    Review.find(filter)
      .populate({ path: 'student', select: 'name avatar' })
      .sort(REVIEW_SORTS[sort] || REVIEW_SORTS.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    Review.getCourseRating(course._id),
    Review.getRatingDistribution(course._id),
  ]);

  return res.json({
    success: true,
    count: reviews.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      averageRating: summary.averageRating, // ⭐ e.g. 4.5
      reviewCount: summary.reviewCount, // e.g. 125
      distribution, // [{ rating: 5, count: 12 }, ...]
    },
    data: reviews,
  });
});
/**
 * PATCH /api/reviews/:id  (author | admin)
 * 💡 Only the student who wrote the review (or an admin moderating content) may
 *    change the rating/comment — the course relationship itself never changes.
 */
const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');

  const isAuthor = String(review.student) === String(req.user._id);
  if (!isAuthor && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own review');
  }

  if (req.body.rating !== undefined) review.rating = req.body.rating;
  if (req.body.comment !== undefined) review.comment = req.body.comment;

  await review.save();
  await review.populate({ path: 'student', select: 'name avatar' });

  const ratingStats = await Review.getCourseRating(review.course);

  return res.json({
    success: true,
    message: 'Review updated',
    data: review,
    meta: { courseRating: ratingStats.averageRating, reviewCount: ratingStats.reviewCount },
  });
});

/**
 * DELETE /api/reviews/:id  (author | admin)
 * 💡 The course rating is *derived* from the reviews collection (aggregation),
 *    so nothing has to be recalculated or kept in sync after a delete — no
 *    stale counters, which is exactly the point of using aggregation here.
 */
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');

  const isAuthor = String(review.student) === String(req.user._id);
  if (!isAuthor && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own review');
  }

  const { course: courseId } = review;
  await review.deleteOne();

  const ratingStats = await Review.getCourseRating(courseId);

  return res.json({
    success: true,
    message: 'Review deleted',
    meta: { courseRating: ratingStats.averageRating, reviewCount: ratingStats.reviewCount },
  });
});

module.exports = { createReview, getCourseReviews, updateReview, deleteReview };

