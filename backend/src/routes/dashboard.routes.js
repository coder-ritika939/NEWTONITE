const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/dashboard/summary
 * Returns item counts for the 3 core views and team health
 */
router.get('/summary', async (req, res, next) => {
  try {
    const user = req.user;
    const teamFilter = user.role === 'ADMIN' ? '' : 'AND wi.team_id = ?';
    const params = user.role === 'ADMIN' ? [] : [user.team_id];

    // 1. Assigned to Me
    const [assignedRows] = await db.query(
      `SELECT COUNT(*) as count FROM work_items wi WHERE wi.assignee_id = ? AND wi.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')`,
      [user.id]
    );

    // 2. Unassigned Urgent
    const [urgentRows] = await db.query(
      `SELECT COUNT(*) as count FROM work_items wi WHERE wi.assignee_id IS NULL AND wi.priority = 'URGENT' AND wi.status IN ('OPEN', 'DRAFT') ${teamFilter}`,
      params
    );

    // 3. Awaiting Approval
    const [approvalRows] = await db.query(
      `SELECT COUNT(*) as count FROM work_items wi WHERE wi.status = 'PENDING_APPROVAL' ${teamFilter}`,
      params
    );

    // 4. Total Active Items
    const [totalActiveRows] = await db.query(
      `SELECT COUNT(*) as count FROM work_items wi WHERE wi.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') ${teamFilter}`,
      params
    );

    res.json({
      success: true,
      summary: {
        assignedToMe: assignedRows[0]?.count || 0,
        unassignedUrgent: urgentRows[0]?.count || 0,
        awaitingApproval: approvalRows[0]?.count || 0,
        totalActive: totalActiveRows[0]?.count || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
