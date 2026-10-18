/**
 * Append-only activity logging service for work items
 */
const db = require('../config/db');

/**
 * Log an immutable activity record
 * @param {Object} client - mysql connection or pool
 * @param {Object} params
 * @param {number} params.workItemId
 * @param {number} params.userId
 * @param {string} params.action - e.g. 'CREATED', 'CLAIMED', 'ASSIGNED', 'STATUS_CHANGE', 'APPROVED', 'EDITED'
 * @param {Object} [params.details]
 */
async function logActivity(client, { workItemId, userId, action, details = null }) {
  const runner = client || db;
  const detailsJson = details ? JSON.stringify(details) : null;

  await runner.query(
    `INSERT INTO work_item_activity (work_item_id, user_id, action, details)
     VALUES (?, ?, ?, ?)`,
    [workItemId, userId, action, detailsJson]
  );
}

module.exports = {
  logActivity
};
