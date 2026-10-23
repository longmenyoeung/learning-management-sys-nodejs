/**
 * ============================================================================
 *  📝 Lesson model — collection: `lessons`
 * ============================================================================
 *  The smallest learning unit. `content` is the text of the lesson and
 *  `duration` its estimated length in minutes.
 *
 *  💡 Access control: the `content` field is only returned to the course
 *     instructor, admins and *enrolled* students (see lesson.controller.js) so
 *     a non-enrolled visitor can only see the lesson titles (preview).
 * ============================================================================
 */
const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: [true, 'A lesson must belong to a section'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Lesson title is required'],
      trim: true,
      minlength: [2, 'Lesson title must be at least 2 characters'],
      maxlength: [200, 'Lesson title must be at most 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be at most 1000 characters'],
      default: '',
    },
    content: {
      type: String,
      required: [true, 'Lesson content is required'],
      trim: true,
    },
    videoUrl: {
      type: String,
      default: '',
      trim: true,
    },
    duration: {
      type: Number,
      required: [true, 'Lesson duration is required'],
      min: [1, 'Duration must be greater than 0'],
      // 💡 duration is expressed in minutes (integer).
      validate: {
        validator: Number.isInteger,
        message: 'Duration must be an integer number of minutes',
      },
    },
    order: {
      type: Number,
      default: 0,
      min: [0, 'Order cannot be negative'],
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/** 💡 Lessons are always read per section, sorted by `order`. */
lessonSchema.index({ section: 1, order: 1 });

/** 💡 Search inside a course's lessons (`?search=middleware`). */
lessonSchema.index({ title: 1 });

// 💡 Idempotent registration (see User.js for the explanation).
const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);

module.exports = Lesson;
