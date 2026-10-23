/**
 * ============================================================================
 *  👤 User model — collection: `users`
 * ============================================================================
 *  💡 Three roles: admin (manages everything), teacher (owns courses),
 *     student (enrolls, learns, reviews).
 *  💡 Password hashing happens in a `pre('save')` hook so it is impossible to
 *     forget it in a controller. `bcryptjs` is a pure-JS implementation (no
 *     native build step, works everywhere).
 * ============================================================================
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  BCRYPT_ROUNDS_DEFAULT,
} = require('../config/security');

const ROLES = ['admin', 'teacher', 'student'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name must be at most 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // 💡 creates a unique index → duplicate email = MongoDB error 11000 → 409
      lowercase: true,
      trim: true,
      match: [/^[\w.+-]+@[\w-]+\.[\w.-]+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`],
      maxlength: [PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`],
      // 💡 `select: false` → the hash is never returned unless explicitly asked
      //    for with `.select('+password')` (login does that).
      select: false,
    },
    role: {
      type: String,
      enum: { values: ROLES, message: 'Role must be admin, teacher or student' },
      default: 'student',
      index: true,
    },
    avatar: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // ── 🔐 Token revocation ────────────────────────────────────────────────
    // 💡 Every token carries the `tv` value at signing time. Incrementing this
    //    counter (logout, password change, password reset) instantly invalidates
    //    every token that was issued before — no session store required.
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    /** Set whenever the password changes → optional audit/“sessions valid after” info. */
    passwordChangedAt: {
      type: Date,
      select: false,
    },
    // ── 🔑 Password reset (only the SHA-256 hash is stored) ────────────────
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        // 💡 Never leak the password hash, reset token, token version or Mongo
        //    internals to the client — not even if a query forgot `select: false`.
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.passwordChangedAt;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/**
 * 🔐 Hash the password before saving (only when it actually changed).
 * 💡 Using `isModified` prevents re-hashing an already hashed password when the
 *    user document is updated for another reason (e.g. changing the name).
 */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || BCRYPT_ROUNDS_DEFAULT;
  this.password = await bcrypt.hash(this.password, rounds);

  // 💡 A new password invalidates every existing token. The counter is bumped
  //    *after* the hash so the freshly issued token (generated from this same
  //    document after save) already uses the new value.
  if (!this.isNew) {
    this.tokenVersion = (this.tokenVersion || 0) + 1;
    this.passwordChangedAt = new Date();
  }

  return next();
});

/**
 * Compare a plain-text candidate with the stored hash.
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** 💡 Virtual shown in the admin dashboard: "teacher / student" instead of true/false. */
userSchema.virtual('isTeacher').get(function () {
  return this.role === 'teacher';
});

/** Shape returned by the auth endpoints (`{ id, name, role, ... }`).
 *  💡 `_id` is converted to a string so the object is JSON-ready and can be
 *     compared directly with the values returned by the API. */
userSchema.methods.toAuthJSON = function toAuthJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    isActive: this.isActive,
  };
};

// 💡 Extra index used by the admin user search (`?role=teacher&search=...`).
userSchema.index({ role: 1, createdAt: -1 });

// 💡 Reset-token lookups are indexed. Note: this is deliberately *not* a TTL
//    index — a TTL index would delete the whole user document.
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// 💡 Idempotent registration: if this file is evaluated twice (hot reload in dev,
//    or the Vitest module graph in the tests) Mongoose would throw
//    `OverwriteModelError` — reusing the already compiled model avoids that.
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
module.exports.ROLES = ROLES;
