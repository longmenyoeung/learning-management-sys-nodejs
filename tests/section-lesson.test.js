/**
 * ============================================================================
 *  🧪 section-lesson.test.js — Phase 3 (Sections & Lessons)
 * ============================================================================
 *  Covers the ownership checks, the auto `order` numbering and the
 *  "content gating" rule (lesson bodies are only visible to enrolled students
 *  and to the course owner).
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  app,
  auth,
  createUser,
  createCategory,
  createCourse,
  createSection,
  createLesson,
  resetDatabase,
} from './helpers.js';
import Lesson from '../src/models/Lesson.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('📖 Sections & 📝 Lessons', () => {
  let admin;
  let teacher;
  let otherTeacher;
  let student;
  let course;

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    otherTeacher = await createUser('teacher');
    student = await createUser('student');
    const category = await createCategory(admin.token);
    course = await createCourse(teacher.token, category._id); // published
  });

  describe('sections', () => {
    it('auto-numbers the section order (1, 2, ...)', async () => {
      const first = await createSection(teacher.token, course._id);
      const second = await createSection(teacher.token, course._id);
      const explicit = await createSection(teacher.token, course._id, { title: 'Bonus', order: 10 });

      expect(first.order).toBe(1);
      expect(second.order).toBe(2);
      expect(explicit.order).toBe(10); // 💡 an explicit order is respected
    });

    it('only the course owner (or an admin) can add a section', async () => {
      const asOtherTeacher = await request(app)
        .post(`/api/courses/${course._id}/sections`)
        .set(auth(otherTeacher.token))
        .send({ title: 'Nope' });
      const asStudent = await request(app)
        .post(`/api/courses/${course._id}/sections`)
        .set(auth(student.token))
        .send({ title: 'Nope' });
      const asAdmin = await request(app)
        .post(`/api/courses/${course._id}/sections`)
        .set(auth(admin.token))
        .send({ title: 'Added by admin' });

      expect(asOtherTeacher.status).toBe(403);
      expect(asStudent.status).toBe(403);
      expect(asAdmin.status).toBe(201);
    });

    it('lists the sections of a course with their lessons publicly', async () => {
      const section = await createSection(teacher.token, course._id, { title: 'Express.js' });
      await createLesson(teacher.token, section._id, { duration: 10 });
      await createLesson(teacher.token, section._id, { duration: 20 });

      const res = await request(app).get(`/api/courses/${course._id}/sections`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0]).toMatchObject({ title: 'Express.js', lessonCount: 2, totalDuration: 30 });
      // ⚠️ the section list never exposes the lesson content
      expect(res.body.data[0].lessons[0].content).toBeUndefined();
    });

    it('returns one section with its lessons and 404 for a wrong id', async () => {
      const section = await createSection(teacher.token, course._id);
      await createLesson(teacher.token, section._id);

      const ok = await request(app).get(`/api/sections/${section._id}`);
      const missing = await request(app).get('/api/sections/66f1f5b2c9d3a4b5e6f7a8b9');

      expect(ok.status).toBe(200);
      expect(ok.body.data.lessons).toHaveLength(1);
      expect(missing.status).toBe(404);
    });

    it('updates a section (owner only) and validates the body', async () => {
      const section = await createSection(teacher.token, course._id);

      const ok = await request(app)
        .patch(`/api/sections/${section._id}`)
        .set(auth(teacher.token))
        .send({ title: 'Renamed section', order: 5 });
      const forbidden = await request(app)
        .patch(`/api/sections/${section._id}`)
        .set(auth(otherTeacher.token))
        .send({ title: 'Hijacked' });
      const invalid = await request(app)
        .patch(`/api/sections/${section._id}`)
        .set(auth(teacher.token))
        .send({});

      expect(ok.body.data).toMatchObject({ title: 'Renamed section', order: 5 });
      expect(forbidden.status).toBe(403);
      expect(invalid.status).toBe(422);
    });

    it('deleting a section also deletes its lessons', async () => {
      const section = await createSection(teacher.token, course._id);
      await createLesson(teacher.token, section._id);
      await createLesson(teacher.token, section._id);

      const res = await request(app).delete(`/api/sections/${section._id}`).set(auth(teacher.token));

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ deletedSection: 1, deletedLessons: 2 });
      expect(await Lesson.countDocuments({ section: section._id })).toBe(0);
    });
  });

  describe('lessons', () => {
    let section;

    beforeEach(async () => {
      section = await createSection(teacher.token, course._id);
    });

    it('auto-numbers the lesson order and validates the payload', async () => {
      const first = await createLesson(teacher.token, section._id, { duration: 5 });
      const second = await createLesson(teacher.token, section._id, { duration: 5 });

      const missingDuration = await request(app)
        .post(`/api/sections/${section._id}/lessons`)
        .set(auth(teacher.token))
        .send({ title: 'No duration', content: 'text' });
      const zeroDuration = await request(app)
        .post(`/api/sections/${section._id}/lessons`)
        .set(auth(teacher.token))
        .send({ title: 'Bad duration', content: 'text', duration: 0 });
      const missingContent = await request(app)
        .post(`/api/sections/${section._id}/lessons`)
        .set(auth(teacher.token))
        .send({ title: 'No content', duration: 5 });

      expect(first.order).toBe(1);
      expect(second.order).toBe(2);
      expect(missingDuration.status).toBe(422);
      expect(zeroDuration.status).toBe(422);
      expect(missingContent.status).toBe(422);
    });

    it('a student cannot create a lesson (403)', async () => {
      const res = await request(app)
        .post(`/api/sections/${section._id}/lessons`)
        .set(auth(student.token))
        .send({ title: 'Sneaky', content: 'text', duration: 5 });

      expect(res.status).toBe(403);
    });

    it('🔒 gates the lesson content: hidden for visitors, visible for the owner', async () => {
      await createLesson(teacher.token, section._id, { content: 'The secret sauce.' });

      const asVisitor = await request(app).get(`/api/sections/${section._id}/lessons`);
      const asAnonymousStudent = await request(app)
        .get(`/api/sections/${section._id}/lessons`)
        .set(auth(student.token));
      const asOwner = await request(app)
        .get(`/api/sections/${section._id}/lessons`)
        .set(auth(teacher.token));

      expect(asVisitor.body.hasAccessToContent).toBe(false);
      expect(asVisitor.body.data[0].content).toBeUndefined();
      expect(asAnonymousStudent.body.hasAccessToContent).toBe(false);
      expect(asOwner.body.hasAccessToContent).toBe(true);
      expect(asOwner.body.data[0].content).toBe('The secret sauce.');
    });

    it('🔓 shows the content to an enrolled student', async () => {
      await createLesson(teacher.token, section._id, { content: 'Enrolled students see this.' });
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const res = await request(app)
        .get(`/api/sections/${section._id}/lessons`)
        .set(auth(student.token));

      expect(res.body.hasAccessToContent).toBe(true);
      expect(res.body.data[0].content).toBe('Enrolled students see this.');
    });

    it('gets one lesson and hides its content from non-enrolled users', async () => {
      const lesson = await createLesson(teacher.token, section._id, { content: 'Body text' });

      const asVisitor = await request(app).get(`/api/lessons/${lesson._id}`);
      const asOwner = await request(app).get(`/api/lessons/${lesson._id}`).set(auth(teacher.token));
      const missing = await request(app).get('/api/lessons/66f1f5b2c9d3a4b5e6f7a8b9');

      expect(asVisitor.body.data.content).toBeUndefined();
      expect(asOwner.body.data.content).toBe('Body text');
      expect(missing.status).toBe(404);
    });

    it('updates and deletes a lesson (owner only)', async () => {
      const lesson = await createLesson(teacher.token, section._id);

      const ok = await request(app)
        .patch(`/api/lessons/${lesson._id}`)
        .set(auth(teacher.token))
        .send({ title: 'Renamed lesson', duration: 45 });
      const forbidden = await request(app)
        .patch(`/api/lessons/${lesson._id}`)
        .set(auth(otherTeacher.token))
        .send({ title: 'Hijacked' });
      const deleted = await request(app).delete(`/api/lessons/${lesson._id}`).set(auth(teacher.token));

      expect(ok.body.data).toMatchObject({ title: 'Renamed lesson', duration: 45 });
      expect(forbidden.status).toBe(403);
      expect(deleted.status).toBe(200);
      expect(await Lesson.countDocuments({ section: section._id })).toBe(0);
    });
  });
});

