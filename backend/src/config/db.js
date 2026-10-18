const mysql = require('mysql2/promise');
const config = require('./env');

// Create MySQL connection pool
const pool = mysql.createPool(config.db);

/**
 * Execute a parameterized SQL query
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<any>}
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Execute an operation inside a managed database transaction
 * @param {Function} callback - Async function receiving the transaction connection
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Test the database connection
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  testConnection
};
