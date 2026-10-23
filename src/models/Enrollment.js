/**
 * ============================================================================
 *  🎓 Enrollment model — collection: `enrollments`
 * ============================================================================
 *  The join table between students and courses:
 *
 *        Student  ──<  Enrollment  >──  Course
 *
 *  💡 The compound unique index `{ student, course }` is the *database level*
 *     guarantee that a student can never enroll twice — even if two requests
 *     arrive at the exact same moment (the controller also checks it for a
 *     friendly 409 message, but the index is the real safety net).
 * ============================================================================
 */
const mongoose = require('mongoose');

const STATUSES = ['active', 'completed', 'cancelled'];

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'An enrollment must have a student'],
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'An enrollment must have a course'],
      index: true,
    },
    status: {
      type: String,
      enum: { values: STATUSES, message: 'Status must be active, completed or cancelled' },
      default: 'active',
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    // 💡 Set by the progress logic as soon as every lesson is completed.
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ── 🔒 Rule 1: a student cannot enroll in the same course twice ─────────────
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

// 💡 Teacher "who is in my course?" / dashboard queries.
enrollmentSchema.index({ course: 1, status: 1, createdAt: -1 });

// 💡 Idempotent registration (see User.js for the explanation).
const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);

module.exports = Enrollment;
module.exports.STATUSES = STATUSES;
