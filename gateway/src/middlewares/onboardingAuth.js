const jwt = require('jsonwebtoken');
const config = require('../config');
const { sendError } = require('../utils/response');

function authenticateOnboarding(req, res, next) {
  const authorization = req.get('authorization');
  const match = authorization && /^Bearer\s+(.+)$/.exec(authorization);
  if (!match) return sendError(res, req, 401, 'INVALID_TOKEN', 'Invalid token');
  try {
    const payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object' || payload.purpose !== 'DRIVER_ONBOARDING' || typeof payload.phone !== 'string' || payload.sub || payload.role) return sendError(res, req, 401, 'INVALID_TOKEN', 'Invalid token');
    req.onboarding = { phone: payload.phone };
    return next();
  } catch (_) { return sendError(res, req, 401, 'INVALID_TOKEN', 'Invalid token'); }
}

module.exports = { authenticateOnboarding };
