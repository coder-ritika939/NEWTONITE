const app = require('./app');
const config = require('./config/env');
const { testConnection } = require('./config/db');

async function startServer() {
  const isDbConnected = await testConnection();
  if (isDbConnected) {
    console.log(`[Database] Connected successfully to MySQL database '${config.db.database}'`);
  } else {
    console.warn(`[Database Warning] Could not establish connection to MySQL at ${config.db.host}:${config.db.port}.`);
    console.warn(`[Database Warning] Ensure MySQL is running and DB_PASSWORD in backend/.env is set.`);
  }

  app.listen(config.port, () => {
    console.log(`[Newtonite Ops Backend] Server is running on http://localhost:${config.port}`);
    console.log(`[Environment] Mode: ${config.nodeEnv}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
