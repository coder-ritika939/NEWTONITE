const express = require('express');
const cors = require('cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const workItemsRoutes = require('./routes/workItems.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const teamsRoutes = require('./routes/teams.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/work-items', workItemsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/teams', teamsRoutes);

// Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
