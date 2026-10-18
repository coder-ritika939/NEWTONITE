const express = require('express');
const workItemService = require('../services/workItem.service');
const { authenticate } = require('../middleware/auth');
const { disallowViewer, canAccessTeam } = require('../middleware/rbac');
const idempotency = require('../middleware/idempotency');
const db = require('../config/db');
const { logActivity } = require('../services/audit.service');

const router = express.Router();

// All work items endpoints require authentication
router.use(authenticate);

/**
 * GET /api/work-items
 * Search, filter, and paginate work items
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await workItemService.listWorkItems(req.query, req.user);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/work-items
 * Create new work item (with Idempotency-Key support)
 */
router.post('/', disallowViewer, idempotency, async (req, res, next) => {
  try {
    const createdItem = await workItemService.createWorkItem(req.body, req.user);
    res.status(201).json({
      success: true,
      item: createdItem
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/work-items/:id
 * Get single work item details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const item = await workItemService.getWorkItemById(req.params.id, req.user);
    res.json({
      success: true,
      item
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/work-items/:id
 * Update work item using version-based optimistic locking (HTTP 409 on conflict)
 */
router.patch('/:id', disallowViewer, async (req, res, next) => {
  try {
    const { version, ...updates } = req.body;
    const updatedItem = await workItemService.updateWorkItem(
      req.params.id,
      updates,
      version,
      req.user
    );

    res.json({
      success: true,
      item: updatedItem
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/work-items/:id/claim
 * Atomically claim an unassigned work item (prevents race conditions)
 */
router.post('/:id/claim', disallowViewer, async (req, res, next) => {
  try {
    const claimedItem = await workItemService.claimWorkItem(req.params.id, req.user);
    res.json({
      success: true,
      item: claimedItem
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/work-items/:id/activity
 * Get append-only activity history
 */
router.get('/:id/activity', async (req, res, next) => {
  try {
    // Check permission to view this item first
    const item = await workItemService.getWorkItemById(req.params.id, req.user);

    const activities = await db.query(
      `SELECT a.id, a.work_item_id, a.action, a.details, a.created_at,
              u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM work_item_activity a
       JOIN users u ON a.user_id = u.id
       WHERE a.work_item_id = ?
       ORDER BY a.created_at DESC`,
      [item.id]
    );

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/work-items/:id/comments
 * Get comments for work item
 */
router.get('/:id/comments', async (req, res, next) => {
  try {
    const item = await workItemService.getWorkItemById(req.params.id, req.user);

    const comments = await db.query(
      `SELECT c.id, c.work_item_id, c.content, c.created_at,
              u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.work_item_id = ?
       ORDER BY c.created_at ASC`,
      [item.id]
    );

    res.json({
      success: true,
      comments
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/work-items/:id/comments
 * Add comment to work item
 */
router.post('/:id/comments', disallowViewer, async (req, res, next) => {
  try {
    const item = await workItemService.getWorkItemById(req.params.id, req.user);
    const content = (req.body.content || '').trim();

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Comment content cannot be empty',
        code: 'VALIDATION_ERROR'
      });
    }

    const [insertResult] = await db.query(
      `INSERT INTO comments (work_item_id, user_id, content) VALUES (?, ?, ?)`,
      [item.id, req.user.id, content]
    );

    // Also log to activity history
    await logActivity(db, {
      workItemId: item.id,
      userId: req.user.id,
      action: 'COMMENTED',
      details: { comment_id: insertResult.insertId, preview: content.slice(0, 80) }
    });

    const [commentRows] = await db.query(
      `SELECT c.id, c.work_item_id, c.content, c.created_at,
              u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [insertResult.insertId]
    );

    res.status(201).json({
      success: true,
      comment: commentRows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
