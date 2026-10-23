/**
 * ============================================================================
 *  🧪 progress.test.js — Phase 5 (Progress tracking) ⭐ the core feature
 * ============================================================================
 *  Completing lessons, the percentage, the automatic course completion and all
 *  the guards around it.
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, auth, createUser, createCategory, createFullCourse, resetDatabase } from './helpers.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('✅ Progress', () => {
  let admin;
  let teacher;
  let otherTeacher;
  let student;
  let course;
  let lessons;

  const enroll = () => request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));
  const complete = (lessonId) =>
    request(app).post(`/api/lessons/${lessonId}/complete`).set(auth(student.token));

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    otherTeacher = await createUser('teacher');
    student = await createUser('student');
    const category = await createCategory(admin.token);
    const full = await createFullCourse(teacher.token, category._id, { lessons: 3 });
    course = full.course;
    lessons = full.lessons;
  });

  describe('POST /api/lessons/:lessonId/complete', () => {
    it('marks a lesson as completed and returns the new percentage', async () => {
      await enroll();

      const res = await complete(lessons[0]._id);

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        totalLessons: 3,
        completedLessons: 1,
        progress: 33, // 1/3 = 33.3 → rounded
        completed: false,
      });
      expect(res.body.data.nextLessonId).toBe(lessons[1]._id);
    });

    it('completing every lesson finishes the course (100 % + enrollment completed)', async () => {
      await enroll();

      await complete(lessons[0]._id);
      await complete(lessons[1]._id);
      const last = await complete(lessons[2]._id);

      const progressRes = await request(app)
        .get(`/api/courses/${course._id}/progress`)
        .set(auth(student.token));
      const myCourses = await request(app).get('/api/enrollments/me').set(auth(student.token));

      expect(last.body.data).toMatchObject({ progress: 100, completed: true, nextLessonId: null });
      expect(progressRes.body.data).toMatchObject({
        totalLessons: 3,
        completedLessons: 3,
        progress: 100,
        completed: true,
        enrollmentStatus: 'completed',
      });
      expect(progressRes.body.data.completedAt).not.toBeNull(); // 🎉 auto-completed
      expect(myCourses.body.data[0].status).toBe('completed');
    });

    it('refuses to complete the same lesson twice (409)', async () => {
      await enroll();
      await complete(lessons[0]._id);

      const res = await complete(lessons[0]._id);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already/i);
    });

    it('refuses a student who is not enrolled (403)', async () => {
      const res = await complete(lessons[0]._id);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/not enrolled/i);
    });

    it('refuses a student whose enrollment was cancelled (403)', async () => {
      await enroll();
      await request(app).delete(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const res = await complete(lessons[0]._id);

      expect(res.status).toBe(403);
    });

    it('refuses teachers/admins (403) and unknown lessons (404)', async () => {
      await enroll();

      const asTeacher = await request(app)
        .post(`/api/lessons/${lessons[0]._id}/complete`)
        .set(auth(teacher.token));
      const asAdmin = await request(app)
        .post(`/api/lessons/${lessons[0]._id}/complete`)
        .set(auth(admin.token));
      const unknown = await request(app)
        .post('/api/lessons/66f1f5b2c9d3a4b5e6f7a8b9/complete')
        .set(auth(student.token));
      const anonymous = await request(app).post(`/api/lessons/${lessons[0]._id}/complete`);

      expect(asTeacher.status).toBe(403);
      expect(asAdmin.status).toBe(403);
      expect(unknown.status).toBe(404);
      expect(anonymous.status).toBe(401);
    });
  });

  describe('GET /api/courses/:courseId/progress', () => {
    it('returns the progress of the logged-in student', async () => {
      await enroll();
      await complete(lessons[0]._id);

      const res = await request(app)
        .get(`/api/courses/${course._id}/progress`)
        .set(auth(student.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        course: course.title,
        totalLessons: 3,
        completedLessons: 1,
        progress: 33,
        completed: false,
      });
    });

    it('refuses a student who is not enrolled (403)', async () => {
      const res = await request(app)
        .get(`/api/courses/${course._id}/progress`)
        .set(auth(student.token));

      expect(res.status).toBe(403);
    });

    it('?details=true lists the per-lesson completion state', async () => {
      await enroll();
      await complete(lessons[0]._id);

      const res = await request(app)
        .get(`/api/courses/${course._id}/progress?details=true`)
        .set(auth(student.token));

      const flat = res.body.data.sections.flatMap((s) => s.lessons);
      expect(flat).toHaveLength(3);
      expect(flat.filter((l) => l.completed)).toHaveLength(1);
      expect(flat.find((l) => l.completed).completedAt).toBeTruthy();
    });

    it('the course owner can read a student progress, another teacher cannot', async () => {
      await enroll();
      await complete(lessons[0]._id);

      const asOwner = await request(app)
        .get(`/api/courses/${course._id}/progress?studentId=${student.user.id}`)
        .set(auth(teacher.token));
      const asOtherTeacher = await request(app)
        .get(`/api/courses/${course._id}/progress?studentId=${student.user.id}`)
        .set(auth(otherTeacher.token));
      const asAdmin = await request(app)
        .get(`/api/courses/${course._id}/progress?studentId=${student.user.id}`)
        .set(auth(admin.token));

      expect(asOwner.status).toBe(200);
      expect(asOwner.body.data.student).toBe(student.user.id);
      expect(asOtherTeacher.status).toBe(403); // 🛡️ ownership check
      expect(asAdmin.status).toBe(200);
    });

    it('recalculates the percentage when a lesson is deleted by the teacher', async () => {
      await enroll();
      await complete(lessons[0]._id);
      await complete(lessons[1]._id);

      // 🗑️ Deleting an *incomplete* lesson must not inflate the percentage:
      //    2 completed out of 2 remaining lessons = 100 %.
      await request(app).delete(`/api/lessons/${lessons[2]._id}`).set(auth(teacher.token));

      const res = await request(app)
        .get(`/api/courses/${course._id}/progress`)
        .set(auth(student.token));

      expect(res.body.data).toMatchObject({ totalLessons: 2, completedLessons: 2, progress: 100 });
      expect(res.body.data.completed).toBe(true);
    });

    it('returns 404 for an unknown course', async () => {
      const res = await request(app)
        .get('/api/courses/66f1f5b2c9d3a4b5e6f7a8b9/progress')
        .set(auth(student.token));

      expect(res.status).toBe(404);
    });
  });
});

