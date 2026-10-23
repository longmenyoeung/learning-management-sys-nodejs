/**
 * ============================================================================
 *  📚 Course model — collection: `courses`
 * ============================================================================
 *  The central resource:
 *
 *        Course  ├── instructor → User
 *                └── category   → Category
 *
 *  Life cycle:  draft → published → archived
 *  💡 Only `published` courses can be enrolled in (enforced in the controller).
 * ============================================================================
 */
const mongoose = require('mongoose');

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const STATUSES = ['draft', 'published', 'archived'];

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Course title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [150, 'Title must be at most 150 characters'],
    },
    description: {
      type: String,
      required: [true, 'Course description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [5000, 'Description must be at most 5000 characters'],
    },
    // ── Relationships ───────────────────────────────────────────────────────
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A course must have an instructor'],
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'A course must have a category'],
      index: true,
    },
    // ── Presentation ────────────────────────────────────────────────────────
    thumbnail: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: [0, 'Price cannot be negative'],
      // 💡 Prevent floating point money noise like 19.999999
      set: (value) => (value === undefined || value === null ? 0 : Math.round(value * 100) / 100),
    },
    level: {
      type: String,
      enum: { values: LEVELS, message: 'Level must be beginner, intermediate or advanced' },
      default: 'beginner',
      index: true,
    },
    status: {
      type: String,
      enum: { values: STATUSES, message: 'Status must be draft, published or archived' },
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ── Virtual relationships (reverse side of the relations) ───────────────────
/** 💡 `course.populate('sections')` → every Section of this course. */
courseSchema.virtual('sections', {
  ref: 'Section',
  localField: '_id',
  foreignField: 'course',
});

/** 💡 `course.populate('reviews')` → every Review of this course. */
courseSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'course',
});

// ── Indexes ─────────────────────────────────────────────────────────────────
// 💡 Search / filter / sort combinations used by `GET /api/courses`:
courseSchema.index({ title: 1 });                                // search + title sort
courseSchema.index({ status: 1, createdAt: -1 });                // default public listing
courseSchema.index({ instructor: 1, status: 1, createdAt: -1 }); // teacher dashboard
courseSchema.index({ category: 1, level: 1, price: 1 });         // category + level + price filters

// 💡 Text-ish index for full-word searches (`?search=node`) — the regex search in
//    the controller also matches partial words, this index helps the exact ones.
courseSchema.index({ title: 'text', description: 'text' });

/**
 * 💡 Virtual helper used by controllers/tests: `course.isPublished`.
 */
courseSchema.virtual('isPublished').get(function () {
  return this.status === 'published';
});

// 💡 Idempotent registration (see User.js for the explanation).
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);

module.exports = Course;
module.exports.LEVELS = LEVELS;
module.exports.STATUSES = STATUSES;
