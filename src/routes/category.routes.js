/**
 * ============================================================================
 *  🛣️  category.routes.js  →  mounted at /api/categories
 * ============================================================================
 *  Reading is public, writing is admin-only (per-route `authorize('admin')`).
 * ============================================================================
 */
const express = require('express');
const {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/category.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const categoryValidators = require('../validators/category.validator');

const router = express.Router();

/**
 * @openapi
 * /categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create a category (admin)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: Web Development }
 *               description: { type: string, example: Everything about the web }
 *     responses:
 *       201:
 *         description: Category created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Category' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *   get:
 *     tags: [Categories]
 *     summary: List categories (public)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, oldest, name_asc, name_desc] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Categories with their course counts (aggregation)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Pagination'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/Category'
 *                           - type: object
 *                             properties:
 *                               courseCount: { type: integer, example: 12 }
 *                               publishedCourseCount: { type: integer, example: 9 }
 */
router
  .route('/')
  .post(authenticate, authorize('admin'), categoryValidators.createCategory, validate, createCategory)
  .get(categoryValidators.listCategories, validate, getCategories);

/**
 * @openapi
 * /categories/{id}:
 *   get:
 *     tags: [Categories]
 *     summary: Get one category (public)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Category' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     tags: [Categories]
 *     summary: Update a category (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Category updated }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 *   delete:
 *     tags: [Categories]
 *     summary: Delete a category (admin)
 *     description: Refused with 409 while courses still reference the category.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Category deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router
  .route('/:id')
  .get(categoryValidators.categoryId, validate, getCategory)
  .patch(authenticate, authorize('admin'), categoryValidators.updateCategory, validate, updateCategory)
  .delete(authenticate, authorize('admin'), categoryValidators.categoryId, validate, deleteCategory);

module.exports = router;
