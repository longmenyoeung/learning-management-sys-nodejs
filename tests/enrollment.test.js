/**
 * ============================================================================
 *  🧪 enrollment.test.js — Phase 4 (Enrollment)
 * ============================================================================
 *  The four enrollment rules from the brief:
 *    1. no duplicate enrollment                      → 409
 *    2. only published courses                       → 400
 *    3. the instructor cannot enroll as a student    → 403
 *    4. only students can enroll                     → 403
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, auth, createUser, createCategory, createFullCourse, resetDatabase } from './helpers.js';
import Course from '../src/models/Course.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('🎓 Enrollment', () => {
  let admin;
  let teacher;
  let otherTeacher;
  let student;
  let otherStudent;
  let category;

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    otherTeacher = await createUser('teacher');
    student = await createUser('student');
    otherStudent = await createUser('student');
    category = await createCategory(admin.token);
  });

  describe('POST /api/courses/:courseId/enroll', () => {
    it('enrolls a student in a published course (201)', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);

      const res = await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        student: student.user.id,
        course: course._id,
        status: 'active',
      });
    });

    it('refuses a second enrollment of the same student (409)', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const res = await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already enrolled/i);
    });

    it('refuses a teacher enrollment (403 — rule 4)', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);

      const asTeacher = await request(app)
        .post(`/api/courses/${course._id}/enroll`)
        .set(auth(otherTeacher.token));
      const asAdmin = await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(admin.token));

      expect(asTeacher.status).toBe(403);
      expect(asAdmin.status).toBe(403);
      // 💡 `authorize('student')` rejects the role before the controller runs,
      //    hence the "requires the role student" message for teachers/admins.
      expect(asTeacher.body.message).toMatch(/role student/i);
      expect(asAdmin.body.message).toMatch(/role student/i);
    });

    it('refuses the instructor of the course (403 — rule 3)', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);
      // ⚡ Edge case: make the *student* the instructor of the course directly in
      //    the database, then let that very student try to enroll.
      await Course.updateOne({ _id: course._id }, { instructor: student.user.id });

      const res = await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/instructor/i);
    });

    it('refuses a draft or archived course (400 — rule 2)', async () => {
      const draft = await createFullCourse(teacher.token, category._id, { status: 'draft' });
      const archived = await createFullCourse(teacher.token, category._id, { status: 'archived' });

      const draftRes = await request(app)
        .post(`/api/courses/${draft.course._id}/enroll`)
        .set(auth(student.token));
      const archivedRes = await request(app)
        .post(`/api/courses/${archived.course._id}/enroll`)
        .set(auth(student.token));

      expect(draftRes.status).toBe(400);
      expect(archivedRes.status).toBe(400);
      expect(draftRes.body.message).toMatch(/published/i);
    });

    it('returns 404 for an unknown course and 401 without a token', async () => {
      const unknown = await request(app)
        .post('/api/courses/66f1f5b2c9d3a4b5e6f7a8b9/enroll')
        .set(auth(student.token));
      const anonymous = await request(app).post(
        '/api/courses/66f1f5b2c9d3a4b5e6f7a8b9/enroll'
      );

      expect(unknown.status).toBe(404);
      expect(anonymous.status).toBe(401);
    });
  });

  describe('GET /api/enrollments/me', () => {
    it('returns the courses of the student with their progress', async () => {
      const { course, section } = await createFullCourse(teacher.token, category._id, { lessons: 2 });
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const lesson = await request(app).get(`/api/sections/${section._id}/lessons`);
      await request(app)
        .post(`/api/lessons/${lesson.body.data[0]._id}/complete`)
        .set(auth(student.token));

      const res = await request(app).get('/api/enrollments/me').set(auth(student.token));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].progress).toBe(50); // 1 of 2 lessons
      expect(res.body.data[0].course.title).toBe(course.title);
      expect(res.body.data[0].nextLessonId).toBeTruthy();
    });

    it('an empty list for a student without enrollments', async () => {
      const res = await request(app).get('/api/enrollments/me').set(auth(otherStudent.token));
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/courses/:courseId/students', () => {
    it('lists the students of a course with their progress (owner only)', async () => {
      const { course, section } = await createFullCourse(teacher.token, category._id, { lessons: 2 });
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(otherStudent.token));

      const lessons = await request(app).get(`/api/sections/${section._id}/lessons`);
      await request(app)
        .post(`/api/lessons/${lessons.body.data[0]._id}/complete`)
        .set(auth(student.token));

      const res = await request(app)
        .get(`/api/courses/${course._id}/students`)
        .set(auth(teacher.token));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.totalLessons).toBe(2);
      const active = res.body.data.find((row) => row.student._id === student.user.id);
      const idle = res.body.data.find((row) => row.student._id === otherStudent.user.id);
      expect(active.progress).toBe(50);
      expect(idle.progress).toBe(0);
      // 🔒 the password hash is never exposed through the populate()
      expect(active.student.password).toBeUndefined();
    });

    it('another teacher or a student cannot read the student list (403)', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);

      const asOtherTeacher = await request(app)
        .get(`/api/courses/${course._id}/students`)
        .set(auth(otherTeacher.token));
      const asStudent = await request(app)
        .get(`/api/courses/${course._id}/students`)
        .set(auth(student.token));

      expect(asOtherTeacher.status).toBe(403);
      expect(asStudent.status).toBe(403);
    });
  });

  describe('DELETE /api/courses/:courseId/enroll', () => {
    it('a student cancels their enrollment and can come back later', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const cancelled = await request(app)
        .delete(`/api/courses/${course._id}/enroll`)
        .set(auth(student.token));
      const again = await request(app).delete(`/api/courses/${course._id}/enroll`).set(auth(student.token));
      const hidden = await request(app).get('/api/enrollments/me').set(auth(student.token));
      const reEnroll = await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('cancelled');
      expect(again.status).toBe(409); // 💡 already cancelled
      expect(hidden.body.count).toBe(0); // cancelled enrollments are hidden by default
      expect(reEnroll.status).toBe(200); // 💡 reactivated, not duplicated
      expect(reEnroll.body.data.status).toBe('active');
    });

    it('the course owner can remove a specific student', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const res = await request(app)
        .delete(`/api/courses/${course._id}/enroll?studentId=${student.user.id}`)
        .set(auth(teacher.token));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });

    it('the owner must provide a studentId (400) and unknown students are 404', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);

      const missingStudentId = await request(app)
        .delete(`/api/courses/${course._id}/enroll`)
        .set(auth(teacher.token));
      const unknownStudent = await request(app)
        .delete(`/api/courses/${course._id}/enroll?studentId=${student.user.id}`)
        .set(auth(teacher.token));

      expect(missingStudentId.status).toBe(400);
      expect(unknownStudent.status).toBe(404);
    });

    it('a student cannot cancel somebody else enrollment', async () => {
      const { course } = await createFullCourse(teacher.token, category._id);
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      // 💡 The student token resolves to *their own* enrollment, so nothing of
      //    the other student is touched → 404 for their (non-existent) row.
      const res = await request(app)
        .delete(`/api/courses/${course._id}/enroll?studentId=${otherStudent.user.id}`)
        .set(auth(student.token));

      expect(res.status).toBe(404);
      const stillEnrolled = await request(app).get('/api/enrollments/me').set(auth(student.token));
      expect(stillEnrolled.body.count).toBe(1);
    });
  });
});

