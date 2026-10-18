/**
 * Centralized error handling middleware
 */
function errorHandler(err, req, res, next) {
  // If response headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);
  const message = err.message || 'Internal Server Error';

  if (statusCode === 500) {
    console.error(`[Unhandled Server Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || 'ERROR',
    details: err.details || null
  });
}

/**
 * 404 Route Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND'
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
