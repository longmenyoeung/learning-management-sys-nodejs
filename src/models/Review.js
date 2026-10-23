/**
 * ============================================================================
 *  ⭐ Review model — collection: `reviews`
 * ============================================================================
 *  Students rate a course from 1 to 5 and may leave a comment.
 *
 *        Student  ──<  Review  >──  Course   (rating 1..5)
 *
 *  💡 Rules enforced here + in the controller:
 *       • only enrolled students can review
 *       • `{ student, course }` is unique → **one review per student per course**
 *       • rating must be an integer between 1 and 5
 *  💡 `statics` below contain the MongoDB **aggregation** that computes the
 *     average rating / review count shown on a course card.
 * ============================================================================
 */
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A review must have a student'],
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'A review must have a course'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number between 1 and 5',
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, 'Comment must be at most 1000 characters'],
      default: '',
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ── 🔒 One review per student per course (DB-level guarantee) ───────────────
reviewSchema.index({ student: 1, course: 1 }, { unique: true });

// 💡 "Newest reviews of this course" + rating aggregations.
reviewSchema.index({ course: 1, createdAt: -1 });
reviewSchema.index({ course: 1, rating: -1 });

/**
 * 📊 MongoDB **aggregation pipeline** that returns rating stats for many courses at once.
 * 💡 Called once per `GET /api/courses` page (not once per course) so a listing
 *    of 10 courses stays at 1 aggregation + 1 find instead of N+1 queries.
 *
 * @param {Array<string|import('mongoose').Types.ObjectId>} courseIds
 * @returns {Promise<Record<string, {averageRating:number, reviewCount:number}>>}
 */
reviewSchema.statics.getCourseRatingStats = async function getCourseRatingStats(courseIds) {
  const ids = (Array.isArray(courseIds) ? courseIds : [courseIds])
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (ids.length === 0) return {};

  const rows = await this.aggregate([
    // 1️⃣ keep only the reviews of the requested courses
    { $match: { course: { $in: ids } } },
    // 2️⃣ group them per course: count + average
    {
      $group: {
        _id: '$course',
        reviewCount: { $sum: 1 },
        averageRating: { $avg: '$rating' },
      },
    },
    // 3️⃣ reshape into something a JSON response can use directly
    {
      $project: {
        _id: 0,
        course: '$_id',
        reviewCount: 1,
        averageRating: { $round: ['$averageRating', 1] }, // 4.666… → 4.7
      },
    },
  ]);

  return rows.reduce((acc, row) => {
    acc[String(row.course)] = {
      averageRating: row.averageRating,
      reviewCount: row.reviewCount,
    };
    return acc;
  }, {});
};

/**
 * Rating stats for a single course.
 * @param {string} courseId
 * @returns {Promise<{averageRating:number, reviewCount:number}>}
 */
reviewSchema.statics.getCourseRating = async function getCourseRating(courseId) {
  const stats = await this.getCourseRatingStats([courseId]);
  return stats[String(courseId)] || { averageRating: 0, reviewCount: 0 };
};

/**
 * ⭐ How many 5★, 4★, ... reviews a course received (nice for a course page).
 * @param {string} courseId
 */
reviewSchema.statics.getRatingDistribution = async function getRatingDistribution(courseId) {
  return this.aggregate([
    { $match: { course: new mongoose.Types.ObjectId(String(courseId)) } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $project: { _id: 0, rating: '$_id', count: 1 } },
  ]);
};

// 💡 Idempotent registration (see User.js for the explanation).
const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

module.exports = Review;
