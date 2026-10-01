const jwt = require('jsonwebtoken');
const config = require('../config');
const { sendError } = require('../utils/response');

function authenticate(req, res, next) {
  const authorization = req.get('authorization');
  const match = authorization && /^Bearer\s+(.+)$/.exec(authorization);
  if (!match) return sendError(res, req, 401, 'INVALID_TOKEN', 'Invalid token');
  try {
    const payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object' || payload.purpose || typeof payload.sub !== 'string' || typeof payload.role !== 'string') return sendError(res, req, 401, 'INVALID_TOKEN', 'Invalid token');
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (_) { return sendError(res, req, 401, 'INVALID_TOKEN', 'Invalid token'); }
}

module.exports = { authenticate };
