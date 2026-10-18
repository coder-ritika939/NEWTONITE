const crypto = require('crypto');
const db = require('../config/db');

/**
 * Middleware to ensure idempotent POST/mutation requests.
 * Uses MySQL InnoDB idempotency_keys table.
 */
function idempotency(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  // If no idempotency key provided, proceed normally
  if (!idempotencyKey) {
    return next();
  }

  // Ensure user is authenticated to scope idempotency key to user
  if (!req.user) {
    return next();
  }

  const endpoint = `${req.method} ${req.baseUrl}${req.path}`;
  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body || {}))
    .digest('hex');

  (async () => {
    try {
      // 1. Check if the key has already been processed for this user
      const existing = await db.query(
        `SELECT response_status, response_body
         FROM idempotency_keys
         WHERE idempotency_key = ? AND user_id = ?`,
        [idempotencyKey, req.user.id]
      );

      if (existing.length > 0) {
        const cached = existing[0];
        const body = typeof cached.response_body === 'string'
          ? JSON.parse(cached.response_body)
          : cached.response_body;

        res.setHeader('Idempotent-Replay', 'true');
        return res.status(cached.response_status).json(body);
      }

      // 2. Intercept response to store result
      const originalJson = res.json.bind(res);
      res.json = function (body) {
        // Only cache 2xx and 4xx responses, not 5xx internal server errors
        if (res.statusCode < 500) {
          const bodyJson = JSON.stringify(body);
          db.query(
            `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_body)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE response_status = VALUES(response_status)`,
            [idempotencyKey, req.user.id, endpoint, requestHash, res.statusCode, bodyJson]
          ).catch((err) => {
            console.error('[Idempotency Error] Failed to persist key:', err.message);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  })();
}

module.exports = idempotency;
