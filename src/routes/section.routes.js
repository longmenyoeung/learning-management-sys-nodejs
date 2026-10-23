/**
 * ============================================================================
 *  🛣️  section.routes.js
 * ============================================================================
 *  💡 One router, two mount points (see server.js + course.routes.js):
 *
 *      /api/courses/:courseId/sections   →  POST /   GET /
 *      /api/sections/:id                 →  GET /:id  PATCH /:id  DELETE /:id
 *
 *  💡 `mergeParams: true` is required for the nested mount, otherwise
 *     `req.params.courseId` would be empty.
 * ============================================================================
 */
const express = require('express');
const {
  createSection,
  getSectionsByCourse,
  getSection,
  updateSection,
  deleteSection,
} = require('../controllers/section.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const sectionValidators = require('../validators/section.validator');

const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * /courses/{courseId}/sections:
 *   post:
 *     tags: [Sections]
 *     summary: Add a section to a course (owner teacher or admin)
 *     description: '`order` is optional — when omitted the section is appended at the end.'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string, example: Introduction }
 *               description: { type: string }
 *               order: { type: integer, example: 1 }
 *     responses:
 *       201:
 *         description: Section created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Section' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Sections]
 *     summary: List the sections of a course, with their lessons (public)
 *     parameters:
 *       - { in: path, name: courseId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Sections sorted by `order`, each with its lessons + total duration
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/')
  .post(
    authenticate,
    authorize('teacher', 'admin'),
    sectionValidators.createSection,
    validate,
    createSection
  )
  .get(sectionValidators.courseIdParam, validate, getSectionsByCourse);

/**
 * @openapi
 * /sections/{id}:
 *   get:
 *     tags: [Sections]
 *     summary: Get one section with its lessons (public)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The section
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Sections]
 *     summary: Update a section (owner teacher or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               order: { type: integer }
 *     responses:
 *       200: { description: Section updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Sections]
 *     summary: Delete a section, its lessons and the related progress (owner teacher or admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Section deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router
  .route('/:id')
  .get(sectionValidators.sectionId, validate, getSection)
  .patch(
    authenticate,
    authorize('teacher', 'admin'),
    sectionValidators.updateSection,
    validate,
    updateSection
  )
  .delete(
    authenticate,
    authorize('teacher', 'admin'),
    sectionValidators.sectionId,
    validate,
    deleteSection
  );

module.exports = router;
