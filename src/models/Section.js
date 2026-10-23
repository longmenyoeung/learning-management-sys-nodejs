/**
 * ============================================================================
 *  📖 Section model — collection: `sections`
 * ============================================================================
 *  A course is split into ordered sections ("Introduction", "Express.js", ...)
 *  and every section contains many lessons.
 *
 *        Course  1 ── N  Section  1 ── N  Lesson
 *
 *  💡 `order` keeps the display sequence; if the client does not send it we
 *     auto-number the section (see section.controller.js).
 * ============================================================================
 */
const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'A section must belong to a course'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Section title is required'],
      trim: true,
      minlength: [2, 'Section title must be at least 2 characters'],
      maxlength: [150, 'Section title must be at most 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be at most 1000 characters'],
      default: '',
    },
    order: {
      type: Number,
      default: 0,
      min: [0, 'Order cannot be negative'],
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/** 💡 The lessons of this section (populated on demand). */
sectionSchema.virtual('lessons', {
  ref: 'Lesson',
  localField: '_id',
  foreignField: 'section',
});

/** 💡 Sections are always read per course, sorted by `order`. */
sectionSchema.index({ course: 1, order: 1 });

// 💡 Idempotent registration (see User.js for the explanation).
const Section = mongoose.models.Section || mongoose.model('Section', sectionSchema);

module.exports = Section;
