/**
 * ============================================================================
 *  ✅ Progress model — collection: `progresses`
 * ============================================================================
 *  One document = "student X completed lesson Y of course Z".
 *
 *        Student: Long   Course: Node.js
 *        ├── Lesson 1 ✅   ← one Progress document
 *        ├── Lesson 2 ✅   ← one Progress document
 *        └── Lesson 3 ❌   ← no document
 *
 *  💡 `course` is duplicated on purpose (it could be derived through the
 *     lesson) because it turns "how many lessons of this course did I finish?"
 *     into a single indexed query instead of a join.
 *  💡 The compound unique index `{ student, course, lesson }` makes completing
 *     the same lesson twice impossible — the controller returns 409 first.
 * ============================================================================
 */
const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Progress must have a student'],
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Progress must have a course'],
      index: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: [true, 'Progress must have a lesson'],
      index: true,
    },
    completed: {
      type: Boolean,
      default: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ── 🔒 One completion row per student + course + lesson ─────────────────────
progressSchema.index({ student: 1, course: 1, lesson: 1 }, { unique: true });

// 💡 Aggregations for the dashboards group by course / student.
progressSchema.index({ course: 1, student: 1, completed: 1 });

// 💡 Idempotent registration (see User.js for the explanation).
const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);

module.exports = Progress;
