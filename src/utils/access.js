/**
 * ============================================================================
 *  🛡️  access.js — resource lookup, ownership and enrollment helpers
 * ============================================================================
 *  💡 The authorization pipeline of this API is:
 *
 *        authenticate  →  authorize(role)  →  resource ownership  →  controller
 *        (who are you?)   (may you use      (do you own THIS
 *                          this route?)      specific document?)
 *
 *     Ownership checks are repeated by many controllers (course, section,
 *     lesson, progress, students list, ...) so they live here instead of being
 *     copy-pasted. Every helper throws an ApiError → handled centrally.
 * ============================================================================
 */
const ApiError = require('./ApiError');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');

/** 💡 Reused `populate()` selections so API responses stay consistent. */
const POPULATE_INSTRUCTOR = { path: 'instructor', select: 'name email role avatar' };
const POPULATE_CATEGORY = { path: 'category', select: 'name description' };

/**
 * Find a course by id or throw 404.
 * @param {string} courseId
 * @param {{ populate?: boolean }} [options]
 */
const findCourseOr404 = async (courseId, { populate = true } = {}) => {
  let query = Course.findById(courseId);
  if (populate) {
    query = query.populate(POPULATE_INSTRUCTOR).populate(POPULATE_CATEGORY);
  }
  const course = await query;
  if (!course) throw ApiError.notFound('Course not found');
  return course;
};

/**
 * Does this user own the course? (Admin owns everything.)
 * 💡 `course.instructor` may be an ObjectId or a populated document — both are handled.
 */
const isCourseOwner = (user, course) => {
  if (!user || !course) return false;
  if (user.role === 'admin') return true;
  const instructorId = course.instructor?._id || course.instructor;
  return String(instructorId) === String(user._id);
};

/**
 * Throw 403 unless the user is the course instructor or an admin.
 * 💡 Teacher B editing Teacher A's course ends up here → 403 Forbidden.
 */
const assertCanManageCourse = (user, course) => {
  if (!isCourseOwner(user, course)) {
    throw ApiError.forbidden('You can only manage courses that you own');
  }
};

/**
 * Find a section and its parent course (needed for ownership checks).
 */
const findSectionOr404 = async (sectionId, { populateCourse = true } = {}) => {
  let query = Section.findById(sectionId);
  if (populateCourse) {
    query = query.populate({
      path: 'course',
      select: 'title instructor status category price',
      populate: [POPULATE_INSTRUCTOR, POPULATE_CATEGORY],
    });
  }
  const section = await query;
  if (!section) throw ApiError.notFound('Section not found');
  // 💡 Defensive: a section whose course was deleted is a dangling document.
  if (populateCourse && !section.course) {
    throw ApiError.notFound('Parent course of this section no longer exists');
  }
  return section;
};

/**
 * Find a lesson with section + course populated (needed for ownership/enrollment).
 */
const findLessonOr404 = async (lessonId) => {
  const lesson = await Lesson.findById(lessonId).populate({
    path: 'section',
    select: 'title course order',
    populate: {
      path: 'course',
      select: 'title instructor status',
      populate: POPULATE_INSTRUCTOR,
    },
  });
  if (!lesson) throw ApiError.notFound('Lesson not found');
  return lesson;
};

/**
 * Lesson ids that belong to a course (course → sections → lessons).
 * 💡 Used for the progress percentage and for cascading deletes.
 */
const getCourseLessonIds = async (courseId) => {
  const sectionIds = await Section.find({ course: courseId }).distinct('_id');
  if (sectionIds.length === 0) return [];
  return Lesson.find({ section: { $in: sectionIds } }).distinct('_id');
};

/**
 * Require an *active* or *completed* enrollment (used by progress + reviews).
 * @param {string} studentId
 * @param {string} courseId
 */
const requireEnrollment = async (studentId, courseId) => {
  const enrollment = await Enrollment.findOne({
    student: studentId,
    course: courseId,
    status: { $in: ['active', 'completed'] },
  });
  if (!enrollment) {
    throw ApiError.forbidden('You must be enrolled in this course to do that');
  }
  return enrollment;
};

module.exports = {
  POPULATE_INSTRUCTOR,
  POPULATE_CATEGORY,
  findCourseOr404,
  isCourseOwner,
  assertCanManageCourse,
  findSectionOr404,
  findLessonOr404,
  getCourseLessonIds,
  requireEnrollment,
};
