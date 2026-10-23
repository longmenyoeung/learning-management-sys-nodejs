/**
 * ============================================================================
 *  🧹 cascade.js — keeping the database consistent when documents are deleted
 * ============================================================================
 *  MongoDB has no `ON DELETE CASCADE` like SQL, so the API must clean up the
 *  related documents itself. These helpers are shared by the course, section
 *  and user controllers.
 *
 *      Course  →  Sections  →  Lessons
 *         ↳  Enrollments / Progress / Reviews
 * ============================================================================
 */
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const Progress = require('../models/Progress');
const Review = require('../models/Review');

const sectionIdsOfCourses = async (courseIds) => {
  if (courseIds.length === 0) return [];
  return Section.find({ course: { $in: courseIds } }).distinct('_id');
};

/**
 * Delete one or many courses **with everything that belongs to them**.
 * @param {Array<string|import('mongoose').Types.ObjectId>} courseIds
 * @returns {Promise<{deletedCourses:number, deletedSections:number, deletedLessons:number, deletedEnrollments:number}>}
 */
const deleteCoursesCascade = async (courseIds) => {
  const ids = (Array.isArray(courseIds) ? courseIds : [courseIds]).filter(Boolean);
  if (ids.length === 0) {
    return { deletedCourses: 0, deletedSections: 0, deletedLessons: 0, deletedEnrollments: 0 };
  }

  const sectionIds = await sectionIdsOfCourses(ids);

  // 💡 Promise.all runs the independent deletes in parallel (one round trip each).
  const [lessons, sections, enrollments, progress, reviews, courses] = await Promise.all([
    Lesson.deleteMany({ section: { $in: sectionIds } }),
    Section.deleteMany({ course: { $in: ids } }),
    Enrollment.deleteMany({ course: { $in: ids } }),
    Progress.deleteMany({ course: { $in: ids } }),
    Review.deleteMany({ course: { $in: ids } }),
    Course.deleteMany({ _id: { $in: ids } }),
  ]);

  return {
    deletedCourses: courses.deletedCount || 0,
    deletedSections: sections.deletedCount || 0,
    deletedLessons: lessons.deletedCount || 0,
    deletedEnrollments: enrollments.deletedCount || 0,
    deletedProgress: progress.deletedCount || 0,
    deletedReviews: reviews.deletedCount || 0,
  };
};

/**
 * Delete a section, its lessons and the progress rows those lessons produced.
 * @param {string} sectionId
 */
const deleteSectionCascade = async (sectionId) => {
  const lessonIds = await Lesson.find({ section: sectionId }).distinct('_id');

  const [lessons, progress, section] = await Promise.all([
    Lesson.deleteMany({ section: sectionId }),
    Progress.deleteMany({ lesson: { $in: lessonIds } }),
    Section.findByIdAndDelete(sectionId),
  ]);

  return {
    deletedSection: section ? 1 : 0,
    deletedLessons: lessons.deletedCount || 0,
    deletedProgress: progress.deletedCount || 0,
  };
};

/**
 * Delete a user together with their footprint:
 *   • courses they teach (and everything inside them)
 *   • their own enrollments, progress rows and reviews
 * @param {string} userId
 */
const deleteUserCascade = async (userId) => {
  const courseIds = await Course.find({ instructor: userId }).distinct('_id');
  const courseResult = await deleteCoursesCascade(courseIds);

  const [enrollments, progress, reviews] = await Promise.all([
    Enrollment.deleteMany({ student: userId }),
    Progress.deleteMany({ student: userId }),
    Review.deleteMany({ student: userId }),
  ]);

  return {
    ...courseResult,
    deletedStudentEnrollments: enrollments.deletedCount || 0,
    deletedStudentProgress: progress.deletedCount || 0,
    deletedStudentReviews: reviews.deletedCount || 0,
  };
};

module.exports = { deleteCoursesCascade, deleteSectionCascade, deleteUserCascade };
