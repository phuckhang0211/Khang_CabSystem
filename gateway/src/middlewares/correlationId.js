const crypto = require('crypto');

function correlationId(req, res, next) {
  req.correlationId = crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
}

module.exports = { correlationId };
