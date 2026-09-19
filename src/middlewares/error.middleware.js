const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.name === 'ValidationError' ? 400 : error.statusCode || 500;
    error = new ApiError(statusCode, error.message || 'Something went wrong');
  }

  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${error.message}\n${err.stack}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${error.message}`);
  }

  res.status(error.statusCode).json({
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    details: error.details || undefined,
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
  });
}

module.exports = errorMiddleware;
