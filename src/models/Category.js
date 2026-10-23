/**
 * ============================================================================
 *  📂 Category model — collection: `categories`
 * ============================================================================
 *  Categories organise courses (Programming, Web Development, Database, ...).
 *  Only admins may create / update / delete them.
 * ============================================================================
 */
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true, // 💡 one "Programming" is enough
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [80, 'Category name must be at most 80 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must be at most 500 characters'],
      default: '',
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/**
 * 💡 Virtual populate: `Course` documents pointing at this category.
 *    `Category.findById(id).populate('courses')` gives every course in the
 *    category without duplicating anything in MongoDB.
 */
categorySchema.virtual('courses', {
  ref: 'Course',
  localField: '_id',
  foreignField: 'category',
});

// 💡 `unique: true` on the field above already creates the `{ name: 1 }` index,
//    so no extra `schema.index({ name: 1 })` here (that would be a duplicate).

// 💡 Idempotent registration (see User.js for the explanation).
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

module.exports = Category;
