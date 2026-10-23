/**
 * ============================================================================
 *  🧪 review.test.js — Phase 6 (Reviews & course rating)
 * ============================================================================
 *  Rules: logged in + enrolled + one review per student per course + rating 1-5.
 *  The average rating is computed with a MongoDB **aggregation**.
 * ============================================================================
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, auth, createUser, createCategory, createFullCourse, resetDatabase } from './helpers.js';

// 🧹 file-level hook: always runs before the describe-level hooks below
beforeEach(resetDatabase);

describe('⭐ Reviews', () => {
  let admin;
  let teacher;
  let student;
  let otherStudent;
  let course;

  const review = (token, body = { rating: 5, comment: 'Very useful course.' }) =>
    request(app).post(`/api/courses/${course._id}/reviews`).set(auth(token)).send(body);

  beforeEach(async () => {
    admin = await createUser('admin');
    teacher = await createUser('teacher');
    student = await createUser('student');
    otherStudent = await createUser('student');
    const category = await createCategory(admin.token);
    ({ course } = await createFullCourse(teacher.token, category._id, { lessons: 1 }));

    // Both students enroll so they are allowed to review.
    await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(student.token));
    await request(app).post(`/api/courses/${course._id}/enroll`).set(auth(otherStudent.token));
  });

  describe('POST /api/courses/:courseId/reviews', () => {
    it('an enrolled student creates a review (201) and the rating is returned', async () => {
      const res = await review(student.token, { rating: 5, comment: 'Excellent!' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ rating: 5, comment: 'Excellent!' });
      expect(res.body.data.student.name).toBeDefined(); // populated
      expect(res.body.meta).toMatchObject({ courseRating: 5, reviewCount: 1 });
    });

    it('refuses a second review of the same course (409)', async () => {
      await review(student.token);

      const res = await review(student.token, { rating: 3 });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already reviewed/i);
    });

    it('refuses a rating outside 1..5 or a non numeric rating (422)', async () => {
      const zero = await review(student.token, { rating: 0 });
      const six = await review(student.token, { rating: 6 });
      const text = await review(student.token, { rating: 'five' });
      const decimal = await review(student.token, { rating: 3.5 });

      expect(zero.status).toBe(422);
      expect(six.status).toBe(422);
      expect(text.status).toBe(422);
      expect(decimal.status).toBe(422);
      expect(six.body.errors.some((e) => e.field === 'rating')).toBe(true);
    });

    it('refuses a student who is not enrolled (403)', async () => {
      const stranger = await createUser('student');

      const res = await review(stranger.token, { rating: 5 });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/enrolled/i);
    });

    it('refuses teachers and admins (403) and unknown courses (404)', async () => {
      const asTeacher = await review(teacher.token, { rating: 5 });
      const asAdmin = await review(admin.token, { rating: 5 });
      const unknown = await request(app)
        .post('/api/courses/66f1f5b2c9d3a4b5e6f7a8b9/reviews')
        .set(auth(student.token))
        .send({ rating: 5 });

      expect(asTeacher.status).toBe(403);
      expect(asAdmin.status).toBe(403);
      expect(unknown.status).toBe(404);
    });
  });

  describe('GET /api/courses/:courseId/reviews', () => {
    it('lists the reviews publicly with an aggregation summary', async () => {
      await review(student.token, { rating: 5 });
      await review(otherStudent.token, { rating: 4, comment: 'Good but dense.' });

      const res = await request(app).get(`/api/courses/${course._id}/reviews`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.summary).toMatchObject({ averageRating: 4.5, reviewCount: 2 });
      expect(res.body.summary.distribution).toEqual([
        { rating: 5, count: 1 },
        { rating: 4, count: 1 },
      ]);
    });

    it('supports ?rating=, sorting and pagination', async () => {
      await review(student.token, { rating: 5 });
      await review(otherStudent.token, { rating: 3 });

      const onlyFive = await request(app).get(`/api/courses/${course._id}/reviews?rating=5`);
      const sorted = await request(app).get(`/api/courses/${course._id}/reviews?sort=rating_desc`);
      const paged = await request(app).get(`/api/courses/${course._id}/reviews?limit=1&page=2`);

      expect(onlyFive.body.total).toBe(1);
      expect(sorted.body.data[0].rating).toBe(5);
      expect(paged.body).toMatchObject({ count: 1, page: 2, totalPages: 2 });
    });

    it('⭐ the average rating shows up on the course detail and in the catalogue', async () => {
      await review(student.token, { rating: 4 });
      await review(otherStudent.token, { rating: 5 });

      const detail = await request(app).get(`/api/courses/${course._id}`);
      const list = await request(app).get('/api/courses?search=Course');

      expect(detail.body.data).toMatchObject({ rating: 4.5, reviewCount: 2 });
      expect(list.body.data[0].rating).toBe(4.5);
      expect(list.body.data[0].reviewCount).toBe(2);
    });

    it('returns 404 for an unknown course', async () => {
      const res = await request(app).get('/api/courses/66f1f5b2c9d3a4b5e6f7a8b9/reviews');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH / DELETE /api/reviews/:id', () => {
    it('the author can update their review', async () => {
      const created = await review(student.token, { rating: 5, comment: 'Perfect' });

      const res = await request(app)
        .patch(`/api/reviews/${created.body.data._id}`)
        .set(auth(student.token))
        .send({ rating: 3, comment: 'Changed my mind' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ rating: 3, comment: 'Changed my mind' });
      expect(res.body.meta.courseRating).toBe(3); // ⭐ recalculated
    });

    it('another student cannot update or delete it (403), an admin can', async () => {
      const created = await review(student.token);
      const reviewId = created.body.data._id;

      const otherPatch = await request(app)
        .patch(`/api/reviews/${reviewId}`)
        .set(auth(otherStudent.token))
        .send({ rating: 1 });
      const adminPatch = await request(app)
        .patch(`/api/reviews/${reviewId}`)
        .set(auth(admin.token))
        .send({ rating: 2 });
      const otherDelete = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set(auth(otherStudent.token));

      expect(otherPatch.status).toBe(403);
      expect(adminPatch.status).toBe(200);
      expect(otherDelete.status).toBe(403);
    });

    it('the author deletes their review and the rating becomes 0 again', async () => {
      const created = await review(student.token);

      const res = await request(app)
        .delete(`/api/reviews/${created.body.data._id}`)
        .set(auth(student.token));
      const detail = await request(app).get(`/api/courses/${course._id}`);

      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ courseRating: 0, reviewCount: 0 });
      expect(detail.body.data).toMatchObject({ rating: 0, reviewCount: 0 });
    });

    it('404 for unknown reviews and 422 for an empty patch body', async () => {
      const created = await review(student.token);

      const unknown = await request(app)
        .patch('/api/reviews/66f1f5b2c9d3a4b5e6f7a8b9')
        .set(auth(admin.token))
        .send({ rating: 4 });
      const empty = await request(app)
        .patch(`/api/reviews/${created.body.data._id}`)
        .set(auth(student.token))
        .send({});

      expect(unknown.status).toBe(404);
      expect(empty.status).toBe(422);
    });
  });
});

