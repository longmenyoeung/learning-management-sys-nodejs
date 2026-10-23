/**
 * ============================================================================
 *  🧪 dashboard.test.js — Phase 7 (Dashboards / aggregations)
 * ============================================================================
 *  Student / Teacher / Admin statistics + the role guards around them.
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, auth, createUser, createCategory, createFullCourse, resetDatabase } from './helpers.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('📊 Dashboards', () => {
  let admin;
  let teacher;
  let otherTeacher;
  let student;

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    otherTeacher = await createUser('teacher');
    student = await createUser('student');
  });

  describe('GET /api/dashboard/student', () => {
    it('returns zeros for a student without enrollments', async () => {
      const res = await request(app).get('/api/dashboard/student').set(auth(student.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        totalCourses: 0,
        completedCourses: 0,
        inProgressCourses: 0,
        averageProgress: 0,
      });
    });

    it('summarizes the courses of the student (progress, completed, in progress)', async () => {
      const category = await createCategory(admin.token);

      // 🎓 Course A: 1 of 2 lessons done → 50 %
      const courseA = await createFullCourse(teacher.token, category._id, { lessons: 2 });
      await request(app).post(`/api/courses/${courseA.course._id}/enroll`).set(auth(student.token));
      await request(app)
        .post(`/api/lessons/${courseA.lessons[0]._id}/complete`)
        .set(auth(student.token));

      // 🏁 Course B: finished completely → completed
      const courseB = await createFullCourse(teacher.token, category._id, { lessons: 1 });
      await request(app).post(`/api/courses/${courseB.course._id}/enroll`).set(auth(student.token));
      await request(app)
        .post(`/api/lessons/${courseB.lessons[0]._id}/complete`)
        .set(auth(student.token));

      const res = await request(app).get('/api/dashboard/student').set(auth(student.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        totalCourses: 2,
        completedCourses: 1,
        inProgressCourses: 1,
        averageProgress: 75, // (50 + 100) / 2
        totalCompletedLessons: 2,
      });
      expect(res.body.data.courses).toHaveLength(2);
    });

    it('is not accessible to a teacher (403)', async () => {
      const res = await request(app).get('/api/dashboard/student').set(auth(teacher.token));
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/dashboard/teacher', () => {
    it('returns empty statistics without courses', async () => {
      const res = await request(app).get('/api/dashboard/teacher').set(auth(teacher.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        totalCourses: 0,
        totalStudents: 0,
        totalEnrollments: 0,
        courses: [],
      });
    });

    it('aggregates courses, students, enrollments, rating and completion rate', async () => {
      const category = await createCategory(admin.token);
      const { course, lessons } = await createFullCourse(teacher.token, category._id, { lessons: 1 });

      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      // ⭐ a second student finishes the course and reviews it
      const finisher = await createUser('student');
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(finisher.token));
      await request(app)
        .post(`/api/lessons/${lessons[0]._id}/complete`)
        .set(auth(finisher.token));
      await request(app)
        .post(`/api/courses/${course._id}/reviews`)
        .set(auth(finisher.token))
        .send({ rating: 5 });

      const res = await request(app).get('/api/dashboard/teacher').set(auth(teacher.token));
      const row = res.body.data.courses[0];

      expect(res.body.data).toMatchObject({
        totalCourses: 1,
        totalPublishedCourses: 1,
        totalStudents: 2, // 👥 distinct students
        totalEnrollments: 2, // 📚 enrollment rows
      });
      expect(row).toMatchObject({
        students: 2,
        activeStudents: 1,
        completedStudents: 1,
        rating: 5,
        reviewCount: 1,
        completionRate: 50, // 1 of 2 students finished
      });
    });

    it('a teacher only sees their own courses and enrollments', async () => {
      const category = await createCategory(admin.token);
      await createFullCourse(teacher.token, category._id, { lessons: 1 });

      const mine = await request(app).get('/api/dashboard/teacher').set(auth(teacher.token));
      const other = await request(app).get('/api/dashboard/teacher').set(auth(otherTeacher.token));

      expect(mine.body.data.totalCourses).toBe(1);
      expect(other.body.data.totalCourses).toBe(0);
    });

    it('an admin sees the whole platform, a student is refused (403)', async () => {
      const category = await createCategory(admin.token);
      await createFullCourse(teacher.token, category._id, { lessons: 1 });

      const asAdmin = await request(app).get('/api/dashboard/teacher').set(auth(admin.token));
      const asStudent = await request(app).get('/api/dashboard/teacher').set(auth(student.token));

      expect(asAdmin.body.data.totalCourses).toBe(1);
      expect(asStudent.status).toBe(403);
    });
  });

  describe('GET /api/dashboard/admin', () => {
    it('returns the platform counters (users by role, courses, categories, enrollments)', async () => {
      const category = await createCategory(admin.token);
      const { course, lessons } = await createFullCourse(teacher.token, category._id, { lessons: 1 });
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));
      await request(app)
        .post(`/api/lessons/${lessons[0]._id}/complete`)
        .set(auth(student.token));
      await request(app)
        .post(`/api/courses/${course._id}/reviews`)
        .set(auth(student.token))
        .send({ rating: 4 });

      const res = await request(app).get('/api/dashboard/admin').set(auth(admin.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        users: 4, // 1 admin + 2 teachers + 1 student
        admins: 1,
        teachers: 2,
        students: 1,
        courses: 1,
        categories: 1,
        enrollments: 1,
        publishedCourses: 1,
        draftCourses: 0,
        completedEnrollments: 1, // 🎉 the only lesson was completed
        inactiveUsers: 0,
        averageCoursePrice: 20,
      });
      expect(res.body.data.coursesByLevel).toMatchObject({ beginner: 1 });
      expect(res.body.data.topRatedCourses[0]).toMatchObject({ title: course.title, averageRating: 4 });
      expect(res.body.data.latestUsers.length).toBeGreaterThan(0);
    });

    it('is admin-only (403 for teacher and student, 401 anonymous)', async () => {
      const asTeacher = await request(app).get('/api/dashboard/admin').set(auth(teacher.token));
      const asStudent = await request(app).get('/api/dashboard/admin').set(auth(student.token));
      const anonymous = await request(app).get('/api/dashboard/admin');

      expect(asTeacher.status).toBe(403);
      expect(asStudent.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });
  });
});

