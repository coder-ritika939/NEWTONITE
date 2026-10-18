const db = require('../config/db');
const { validateTransition } = require('./workflow.service');
const { logActivity } = require('./audit.service');
const { canAccessTeam, canApproveItem } = require('../middleware/rbac');

class WorkItemService {
  /**
   * Helper to format HTTP errors with status codes
   */
  createError(message, statusCode, code = 'ERROR', details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
  }

  /**
   * Generate next human-readable item key (e.g. NEWT-1042)
   */
  async generateItemKey(connection) {
    const [rows] = await connection.query(`SELECT MAX(id) as maxId FROM work_items`);
    const nextId = (rows[0]?.maxId || 1000) + 1;
    return `NEWT-${nextId}`;
  }

  /**
   * Fetch item by ID and verify user team access
   */
  async getWorkItemById(id, currentUser) {
    const rows = await db.query(
      `SELECT wi.*,
              t.name AS team_name,
              cu.name AS creator_name, cu.email AS creator_email,
              au.name AS assignee_name, au.email AS assignee_email
       FROM work_items wi
       JOIN teams t ON wi.team_id = t.id
       JOIN users cu ON wi.created_by = cu.id
       LEFT JOIN users au ON wi.assignee_id = au.id
       WHERE wi.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      throw this.createError('Work item not found', 404, 'NOT_FOUND');
    }

    const item = rows[0];

    // Enforce team-based permissions
    if (!canAccessTeam(currentUser, item.team_id)) {
      throw this.createError(
        'Access denied: You do not have permission to view work items for this team',
        403,
        'FORBIDDEN_TEAM'
      );
    }

    return item;
  }

  /**
   * Create a new work item
   */
  async createWorkItem(data, currentUser) {
    if (currentUser.role === 'VIEWER') {
      throw this.createError('Viewers have read-only access and cannot create work items', 403, 'VIEWER_READ_ONLY');
    }

    const teamId = Number(data.team_id) || Number(currentUser.team_id);
    if (!teamId) {
      throw this.createError('A valid team_id is required', 400, 'INVALID_TEAM');
    }

    if (!canAccessTeam(currentUser, teamId)) {
      throw this.createError('Access denied: You cannot create work items for another team', 403, 'FORBIDDEN_TEAM');
    }

    const title = (data.title || '').trim();
    if (!title) {
      throw this.createError('Title is required', 400, 'VALIDATION_ERROR');
    }

    const type = data.type || 'Task';
    const priority = data.priority || 'MEDIUM';
    const status = data.status || 'OPEN';
    const description = data.description || '';
    const assigneeId = data.assignee_id ? Number(data.assignee_id) : null;

    return await db.withTransaction(async (conn) => {
      const itemKey = await this.generateItemKey(conn);

      const [insertResult] = await conn.execute(
        `INSERT INTO work_items (item_key, title, description, type, priority, status, team_id, created_by, assignee_id, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [itemKey, title, description, type, priority, status, teamId, currentUser.id, assigneeId]
      );

      const newItemId = insertResult.insertId;

      // Log initial activity
      await logActivity(conn, {
        workItemId: newItemId,
        userId: currentUser.id,
        action: 'CREATED',
        details: { item_key: itemKey, title, type, priority, status }
      });

      // If created with assignee, log assignment
      if (assigneeId) {
        await logActivity(conn, {
          workItemId: newItemId,
          userId: currentUser.id,
          action: 'ASSIGNED',
          details: { assignee_id: assigneeId }
        });
      }

      const [items] = await conn.query(
        `SELECT wi.*, t.name AS team_name, cu.name AS creator_name, au.name AS assignee_name
         FROM work_items wi
         JOIN teams t ON wi.team_id = t.id
         JOIN users cu ON wi.created_by = cu.id
         LEFT JOIN users au ON wi.assignee_id = au.id
         WHERE wi.id = ?`,
        [newItemId]
      );

      return items[0];
    });
  }

  /**
   * Requirement 9: Claim an unassigned item atomically.
   * Prevents race conditions where two users attempt to claim the same unassigned item.
   */
  async claimWorkItem(id, currentUser) {
    if (currentUser.role === 'VIEWER') {
      throw this.createError('Viewers have read-only access and cannot claim work items', 403, 'VIEWER_READ_ONLY');
    }

    return await db.withTransaction(async (conn) => {
      // 1. Fetch current item to check permissions
      const [rows] = await conn.query(
        `SELECT id, team_id, status, assignee_id, version FROM work_items WHERE id = ? FOR UPDATE`,
        [id]
      );

      if (rows.length === 0) {
        throw this.createError('Work item not found', 404, 'NOT_FOUND');
      }

      const item = rows[0];

      if (!canAccessTeam(currentUser, item.team_id)) {
        throw this.createError('Access denied: You cannot claim items from another team', 403, 'FORBIDDEN_TEAM');
      }

      // Check if item is already claimed
      if (item.assignee_id !== null) {
        throw this.createError(
          `Item has already been claimed by user ID ${item.assignee_id}`,
          409,
          'ALREADY_CLAIMED'
        );
      }

      // 2. Atomic update claiming the item and incrementing version
      const newStatus = item.status === 'OPEN' ? 'IN_PROGRESS' : item.status;
      const [updateResult] = await conn.execute(
        `UPDATE work_items
         SET assignee_id = ?, status = ?, version = version + 1, updated_at = NOW()
         WHERE id = ? AND assignee_id IS NULL`,
        [currentUser.id, newStatus, id]
      );

      if (updateResult.affectedRows === 0) {
        // Concurrency collision occurred
        throw this.createError(
          'Failed to claim: Work item was already claimed by another user',
          409,
          'CONCURRENCY_CONFLICT'
        );
      }

      // 3. Log append-only activity
      await logActivity(conn, {
        workItemId: id,
        userId: currentUser.id,
        action: 'CLAIMED',
        details: { previous_status: item.status, new_status: newStatus }
      });

      const [updatedRows] = await conn.query(
        `SELECT wi.*, t.name AS team_name, cu.name AS creator_name, au.name AS assignee_name
         FROM work_items wi
         JOIN teams t ON wi.team_id = t.id
         JOIN users cu ON wi.created_by = cu.id
         LEFT JOIN users au ON wi.assignee_id = au.id
         WHERE wi.id = ?`,
        [id]
      );

      return updatedRows[0];
    });
  }

  /**
   * Requirement 10: Update work item using version-based optimistic locking.
   * Rejects stale updates with HTTP 409.
   */
  async updateWorkItem(id, updates, expectedVersion, currentUser) {
    if (currentUser.role === 'VIEWER') {
      throw this.createError('Viewers have read-only access and cannot edit work items', 403, 'VIEWER_READ_ONLY');
    }

    if (expectedVersion === undefined || expectedVersion === null) {
      throw this.createError(
        'Optimistic locking required: expected version must be provided in request body as "version"',
        400,
        'VERSION_REQUIRED'
      );
    }

    return await db.withTransaction(async (conn) => {
      // 1. Fetch current item
      const [rows] = await conn.query(
        `SELECT * FROM work_items WHERE id = ? FOR UPDATE`,
        [id]
      );

      if (rows.length === 0) {
        throw this.createError('Work item not found', 404, 'NOT_FOUND');
      }

      const current = rows[0];

      // Verify team access
      if (!canAccessTeam(currentUser, current.team_id)) {
        throw this.createError('Access denied: You cannot modify work items belonging to another team', 403, 'FORBIDDEN_TEAM');
      }

      // Check version optimistic lock
      if (Number(current.version) !== Number(expectedVersion)) {
        throw this.createError(
          `Conflict: Work item was modified by another user. Your version: ${expectedVersion}, current version: ${current.version}. Please refresh.`,
          409,
          'OPTIMISTIC_LOCK_CONFLICT',
          { current_version: current.version, your_version: expectedVersion }
        );
      }

      // Check status transition if status is being updated
      let targetStatus = current.status;
      if (updates.status && updates.status !== current.status) {
        const transitionCheck = validateTransition(current, updates.status, currentUser);
        if (!transitionCheck.valid) {
          throw this.createError(transitionCheck.error, 400, 'INVALID_TRANSITION');
        }
        targetStatus = updates.status;
      }

      // Check assignee permissions if changing assignee
      let targetAssignee = current.assignee_id;
      if (updates.assignee_id !== undefined) {
        if (currentUser.role !== 'LEAD' && currentUser.role !== 'ADMIN' && updates.assignee_id !== currentUser.id) {
          throw this.createError('Only Team Leads and Admins can assign items to other members', 403, 'FORBIDDEN_ASSIGN');
        }
        targetAssignee = updates.assignee_id ? Number(updates.assignee_id) : null;
      }

      const targetTitle = updates.title !== undefined ? updates.title.trim() : current.title;
      const targetDescription = updates.description !== undefined ? updates.description : current.description;
      const targetPriority = updates.priority !== undefined ? updates.priority : current.priority;
      const targetType = updates.type !== undefined ? updates.type : current.type;

      // 2. Perform optimistic update
      const [updateResult] = await conn.execute(
        `UPDATE work_items
         SET title = ?,
             description = ?,
             priority = ?,
             type = ?,
             status = ?,
             assignee_id = ?,
             version = version + 1,
             updated_at = NOW()
         WHERE id = ? AND version = ?`,
        [targetTitle, targetDescription, targetPriority, targetType, targetStatus, targetAssignee, id, expectedVersion]
      );

      if (updateResult.affectedRows === 0) {
        throw this.createError(
          'Conflict: Update rejected due to concurrent modification. Please refresh and try again.',
          409,
          'OPTIMISTIC_LOCK_CONFLICT'
        );
      }

      // 3. Log activity
      const changes = {};
      if (targetStatus !== current.status) changes.status = { from: current.status, to: targetStatus };
      if (targetAssignee !== current.assignee_id) changes.assignee = { from: current.assignee_id, to: targetAssignee };
      if (targetPriority !== current.priority) changes.priority = { from: current.priority, to: targetPriority };

      let action = 'EDITED';
      if (current.status === 'PENDING_APPROVAL' && targetStatus === 'RESOLVED') {
        action = 'APPROVED';
      } else if (changes.status) {
        action = 'STATUS_CHANGED';
      } else if (changes.assignee) {
        action = 'ASSIGNED';
      }

      await logActivity(conn, {
        workItemId: id,
        userId: currentUser.id,
        action,
        details: changes
      });

      const [updatedItem] = await conn.query(
        `SELECT wi.*, t.name AS team_name, cu.name AS creator_name, au.name AS assignee_name
         FROM work_items wi
         JOIN teams t ON wi.team_id = t.id
         JOIN users cu ON wi.created_by = cu.id
         LEFT JOIN users au ON wi.assignee_id = au.id
         WHERE wi.id = ?`,
        [id]
      );

      return updatedItem[0];
    });
  }

  /**
   * Search, filter, and paginate work items
   */
  async listWorkItems(params, currentUser) {
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const queryParams = [];

    // Team filtering
    if (currentUser.role !== 'ADMIN') {
      whereClauses.push(`wi.team_id = ?`);
      queryParams.push(currentUser.team_id);
    } else if (params.team_id) {
      whereClauses.push(`wi.team_id = ?`);
      queryParams.push(params.team_id);
    }

    // Dashboard Views
    if (params.view === 'assigned_to_me') {
      whereClauses.push(`wi.assignee_id = ?`);
      queryParams.push(currentUser.id);
    } else if (params.view === 'unassigned_urgent') {
      whereClauses.push(`wi.assignee_id IS NULL AND wi.priority = 'URGENT' AND wi.status IN ('OPEN', 'DRAFT')`);
    } else if (params.view === 'awaiting_approval') {
      whereClauses.push(`wi.status = 'PENDING_APPROVAL'`);
      if (currentUser.role === 'LEAD') {
        whereClauses.push(`wi.team_id = ?`);
        queryParams.push(currentUser.team_id);
      }
    }

    // Direct Filters
    if (params.status) {
      whereClauses.push(`wi.status = ?`);
      queryParams.push(params.status);
    }
    if (params.priority) {
      whereClauses.push(`wi.priority = ?`);
      queryParams.push(params.priority);
    }
    if (params.type) {
      whereClauses.push(`wi.type = ?`);
      queryParams.push(params.type);
    }
    if (params.assignee_id !== undefined && params.assignee_id !== '') {
      if (params.assignee_id === 'unassigned' || params.assignee_id === 'null') {
        whereClauses.push(`wi.assignee_id IS NULL`);
      } else {
        whereClauses.push(`wi.assignee_id = ?`);
        queryParams.push(params.assignee_id);
      }
    }

    // Search query on title, description, or item_key
    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      whereClauses.push(`(wi.title LIKE ? OR wi.description LIKE ? OR wi.item_key LIKE ?)`);
      queryParams.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total matching items
    const countQuery = `SELECT COUNT(*) as total FROM work_items wi ${whereSql}`;
    const countRows = await db.query(countQuery, queryParams);
    const total = countRows[0]?.total || 0;

    // Fetch paginated page
    const selectQuery = `
      SELECT wi.*,
             t.name AS team_name,
             cu.name AS creator_name,
             au.name AS assignee_name
      FROM work_items wi
      JOIN teams t ON wi.team_id = t.id
      JOIN users cu ON wi.created_by = cu.id
      LEFT JOIN users au ON wi.assignee_id = au.id
      ${whereSql}
      ORDER BY
        CASE wi.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        wi.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const items = await db.query(selectQuery, [...queryParams, limit, offset]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new WorkItemService();
