const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Request failed');
  let status = Number.isInteger(err.status) ? err.status : 500;
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (err.code === 11000) status = 409;
  const message = status >= 500 ? 'Internal Server Error' : err.message;
  res.status(status).json({ error: message });
};
