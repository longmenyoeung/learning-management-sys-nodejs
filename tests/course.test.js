/**
 * ============================================================================
 *  🧪 course.test.js — Phase 2 (Courses: CRUD, search, filter, sort, pagination)
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
  createFullCourse,
  resetDatabase,
} from './helpers.js';
import Enrollment from '../src/models/Enrollment.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('📚 Courses', () => {
  let admin;
  let teacher;
  let otherTeacher;
  let student;
  let category;

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    otherTeacher = await createUser('teacher');
    student = await createUser('student');
    category = await createCategory(admin.token);
  });

  const newCourse = (overrides = {}) => ({
    title: 'Node.js REST API',
    description: 'Learn how to build REST APIs with Node.js and Express.',
    category: category._id,
    price: 20,
    level: 'beginner',
    ...overrides,
  });

  describe('create', () => {
    it('a teacher creates a draft course by default (201)', async () => {
      const res = await request(app).post('/api/courses').set(auth(teacher.token)).send(newCourse());

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('draft'); // 💡 never published by accident
      expect(res.body.data.instructor._id).toBe(teacher.user.id);
      expect(res.body.data.rating).toBe(0);
      expect(res.body.data.reviewCount).toBe(0);
    });

    it('a student cannot create a course (403)', async () => {
      const res = await request(app).post('/api/courses').set(auth(student.token)).send(newCourse());

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires the role/i);
    });

    it('an anonymous request cannot create a course (401)', async () => {
      const res = await request(app).post('/api/courses').send(newCourse());
      expect(res.status).toBe(401);
    });

    it('an admin can create a course on behalf of a teacher', async () => {
      const res = await request(app)
        .post('/api/courses')
        .set(auth(admin.token))
        .send(newCourse({ instructor: teacher.user.id }));

      expect(res.status).toBe(201);
      expect(res.body.data.instructor._id).toBe(teacher.user.id);
    });

    it('rejects an unknown category (404) and an invalid body (422)', async () => {
      const unknownCategory = await request(app)
        .post('/api/courses')
        .set(auth(teacher.token))
        .send(newCourse({ category: '66f1f5b2c9d3a4b5e6f7a8b9' }));

      const invalid = await request(app)
        .post('/api/courses')
        .set(auth(teacher.token))
        .send({ title: 'x', description: 'short', category: 'nope', price: -5, level: 'expert' });

      expect(unknownCategory.status).toBe(404);
      expect(invalid.status).toBe(422);
      expect(invalid.body.errors.map((e) => e.field)).toEqual(
        expect.arrayContaining(['title', 'description', 'category', 'price', 'level'])
      );
    });
  });

  describe('read', () => {
    it('the public catalogue only lists published courses', async () => {
      await createCourse(teacher.token, category._id, { title: 'Published one', status: 'published' });
      await createCourse(teacher.token, category._id, { title: 'Draft one', status: 'draft' });

      const res = await request(app).get('/api/courses');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].title).toBe('Published one');
      expect(res.body.data[0].instructor.name).toBeDefined(); // populate()
      expect(res.body.data[0].category.name).toBeDefined();
    });

    it('a teacher can list their own drafts, but not those of another teacher', async () => {
      await createCourse(teacher.token, category._id, { status: 'draft' });

      const mine = await request(app).get('/api/courses?status=draft').set(auth(teacher.token));
      const other = await request(app)
        .get(`/api/courses?status=draft&instructor=${teacher.user.id}`)
        .set(auth(otherTeacher.token));

      expect(mine.status).toBe(200);
      expect(mine.body.total).toBe(1);
      expect(other.status).toBe(403);
    });

    it('a student cannot filter by status (403), an anonymous user gets 401', async () => {
      const asStudent = await request(app).get('/api/courses?status=draft').set(auth(student.token));
      const anonymous = await request(app).get('/api/courses?status=draft');

      expect(asStudent.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });

    it('hides an unpublished course from other users (403) but not from its owner', async () => {
      const course = await createCourse(teacher.token, category._id, { status: 'draft' });

      const asOwner = await request(app).get(`/api/courses/${course._id}`).set(auth(teacher.token));
      const asOtherTeacher = await request(app)
        .get(`/api/courses/${course._id}`)
        .set(auth(otherTeacher.token));
      const asVisitor = await request(app).get(`/api/courses/${course._id}`);

      expect(asOwner.status).toBe(200);
      expect(asOtherTeacher.status).toBe(403);
      expect(asVisitor.status).toBe(403);
    });

    it('returns 404 for an unknown course', async () => {
      const res = await request(app).get('/api/courses/66f1f5b2c9d3a4b5e6f7a8b9');
      expect(res.status).toBe(404);
    });
  });

  describe('search / filter / sort / pagination', () => {
    beforeEach(async () => {
      // 5 published courses with different titles / prices / levels
      await createCourse(teacher.token, category._id, {
        title: 'Node.js REST API',
        description: 'Build REST APIs with Node and Express',
        price: 10,
        level: 'beginner',
      });
      await createCourse(teacher.token, category._id, {
        title: 'Advanced Node.js',
        description: 'Streams, clusters and performance',
        price: 50,
        level: 'advanced',
      });
      await createCourse(teacher.token, category._id, {
        title: 'React Basics',
        description: 'Components and hooks',
        price: 30,
        level: 'beginner',
      });
      await createCourse(teacher.token, category._id, { title: 'MongoDB Deep Dive', price: 20 });
      await createCourse(teacher.token, category._id, { title: 'Docker for Node developers', price: 40 });
    });

    it('?search= matches the title and the description', async () => {
      const byTitle = await request(app).get('/api/courses?search=react');
      const byDescription = await request(app).get('/api/courses?search=hooks');

      expect(byTitle.body.total).toBe(1);
      expect(byTitle.body.data[0].title).toBe('React Basics');
      expect(byDescription.body.total).toBe(1);
      expect(byDescription.body.data[0].title).toBe('React Basics');
    });

    it('?category= and ?level= filter the catalogue', async () => {
      const byCategory = await request(app).get(`/api/courses?category=${category._id}`);
      const byLevel = await request(app).get('/api/courses?level=advanced');

      expect(byCategory.body.total).toBe(5);
      expect(byLevel.body.total).toBe(1);
      expect(byLevel.body.data[0].level).toBe('advanced');
    });

    it('?price= is an exact match and ?price_from/?price_to is a range', async () => {
      const exact = await request(app).get('/api/courses?price=30');
      const range = await request(app).get('/api/courses?price_from=20&price_to=40');

      expect(exact.body.total).toBe(1);
      expect(exact.body.data[0].price).toBe(30);
      // 💡 the fixtures are priced 10, 20, 30, 40 and 50 → 20/30/40 are in range
      expect(range.body.total).toBe(3);
      expect(range.body.data.map((c) => c.price).sort((a, b) => a - b)).toEqual([20, 30, 40]);
    });

    it('?sort=price_asc / price_desc orders the results', async () => {
      const asc = await request(app).get('/api/courses?sort=price_asc');
      const desc = await request(app).get('/api/courses?sort=price_desc');

      expect(asc.body.data.map((c) => c.price)).toEqual([10, 20, 30, 40, 50]);
      expect(desc.body.data[0].price).toBe(50);
    });

    it('paginates with ?page & ?limit and returns the pagination meta', async () => {
      const first = await request(app).get('/api/courses?page=1&limit=2&sort=price_asc');
      const second = await request(app).get('/api/courses?page=2&limit=2&sort=price_asc');
      const third = await request(app).get('/api/courses?page=3&limit=2&sort=price_asc');

      expect(first.body).toMatchObject({ count: 2, total: 5, page: 1, totalPages: 3, hasNextPage: true });
      expect(second.body.data.map((c) => c.price)).toEqual([30, 40]);
      expect(third.body).toMatchObject({ count: 1, hasNextPage: false });
    });

    it('validates the query string (422) and never returns a negative price', async () => {
      const badPrice = await request(app).get('/api/courses?price=abc');
      const negative = await request(app).get('/api/courses?price_from=-5');
      const badSort = await request(app).get('/api/courses?sort=cheapest');

      expect(badPrice.status).toBe(422);
      expect(negative.status).toBe(422);
      expect(badSort.status).toBe(422);
    });

    it('rejects an inverted price range with 400', async () => {
      const res = await request(app).get('/api/courses?price_from=90&price_to=10');
      expect(res.status).toBe(400);
    });

    it('combines several filters in one request', async () => {
      const res = await request(app).get(
        '/api/courses?search=node&level=beginner&price_from=5&price_to=50&page=1&limit=10'
      );

      expect(res.status).toBe(200);
      // 💡 "node" matches "Node.js REST API" and "Docker for Node developers",
      //    both of them `beginner` and priced inside the range.
      expect(res.body.total).toBe(2);
      expect(res.body.data.map((c) => c.title).sort()).toEqual([
        'Docker for Node developers',
        'Node.js REST API',
      ]);
    });
  });

  describe('update / delete', () => {
    it('the owner can update their course (title, price, level, status)', async () => {
      const course = await createCourse(teacher.token, category._id, { status: 'draft' });

      const res = await request(app)
        .patch(`/api/courses/${course._id}`)
        .set(auth(teacher.token))
        .send({ title: 'Updated title', price: 99.5, level: 'advanced', status: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        title: 'Updated title',
        price: 99.5,
        level: 'advanced',
        status: 'published', // 📢 the teacher publishes the course
      });
    });

    it('another teacher gets 403 (ownership check) but an admin may update', async () => {
      const course = await createCourse(teacher.token, category._id);

      const asOtherTeacher = await request(app)
        .patch(`/api/courses/${course._id}`)
        .set(auth(otherTeacher.token))
        .send({ title: 'Hijacked' });

      const asAdmin = await request(app)
        .patch(`/api/courses/${course._id}`)
        .set(auth(admin.token))
        .send({ title: 'Moderated by admin' });

      expect(asOtherTeacher.status).toBe(403);
      expect(asOtherTeacher.body.message).toMatch(/own/i);
      expect(asAdmin.status).toBe(200);
    });

    it('validates an update: empty body and unknown category', async () => {
      const course = await createCourse(teacher.token, category._id);

      const empty = await request(app)
        .patch(`/api/courses/${course._id}`)
        .set(auth(teacher.token))
        .send({});
      const wrongCategory = await request(app)
        .patch(`/api/courses/${course._id}`)
        .set(auth(teacher.token))
        .send({ category: '66f1f5b2c9d3a4b5e6f7a8b9' });

      expect(empty.status).toBe(422);
      expect(wrongCategory.status).toBe(404);
    });

    it('deleting a course cascades to sections, lessons and enrollments', async () => {
      const { course } = await createFullCourse(teacher.token, category._id, { lessons: 2 });
      await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));

      const before = await Enrollment.countDocuments({ course: course._id });
      const res = await request(app).delete(`/api/courses/${course._id}`).set(auth(teacher.token));
      const after = await Enrollment.countDocuments({ course: course._id });

      expect(before).toBe(1);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ deletedCourses: 1, deletedSections: 1, deletedLessons: 2 });
      expect(after).toBe(0);
    });

    it('a non-owner cannot delete a course (403) and 404 for unknown ids', async () => {
      const course = await createCourse(teacher.token, category._id);

      const forbidden = await request(app)
        .delete(`/api/courses/${course._id}`)
        .set(auth(otherTeacher.token));
      const unknown = await request(app).delete('/api/courses/66f1f5b2c9d3a4b5e6f7a8b9').set(auth(admin.token));

      expect(forbidden.status).toBe(403);
      expect(unknown.status).toBe(404);
    });
  });
});


