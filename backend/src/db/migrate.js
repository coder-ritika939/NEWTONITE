const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');

async function runMigration() {
  console.log(`[Migration] Connecting to MySQL server at ${config.db.host}:${config.db.port} as '${config.db.user}'...`);

  let connection;
  try {
    // 1. Connect without selecting database to ensure database can be created
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      multipleStatements: true
    });

    const dbName = config.db.database;
    console.log(`[Migration] Creating database '${dbName}' if it doesn't exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${dbName}\`;`);

    // 2. Read schema.sql
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`[Migration] Applying schema from schema.sql...`);
    await connection.query(schemaSql);

    console.log(`[Migration] Database schema applied successfully for '${dbName}'!`);
  } catch (error) {
    console.error(`\n[Migration Error] Failed to execute database migration:`);
    console.error(`Message: ${error.message}`);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`\n-> Authentication failed for MySQL user '${config.db.user}'.`);
      console.error(`-> Please check and set your MySQL password in 'backend/.env' (DB_PASSWORD=...).`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error(`\n-> Unable to reach MySQL server at ${config.db.host}:${config.db.port}.`);
      console.error(`-> Please verify that the MySQL service is running.`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
