const Redis = require('ioredis');
const config = require('../config');
const { sendError } = require('../utils/response');
const redis = new Redis(config.redisUrl, { connectTimeout: 250, commandTimeout: 250, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => 100 });
redis.on('error', () => {});
const incrementScript = "local count=redis.call('INCR',KEYS[1]); local ttl=redis.call('TTL',KEYS[1]); if count==1 or ttl==-1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); ttl=redis.call('TTL',KEYS[1]); end; return {count,ttl}";
function warn(req) { console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', service: 'gateway', correlationId: req.correlationId, msg: 'Rate limit Redis unavailable; allowing request' })); }
function rateLimit({ name, limit, keyFn }) {
  return async (req, res, next) => {
    try {
      const [count, ttl] = await redis.eval(incrementScript, 1, `ratelimit:${name}:${keyFn(req)}`, config.rateLimitWindowSeconds);
      if (Number(count) > limit) { res.setHeader('Retry-After', String(Math.max(1, Number(ttl)))); return sendError(res, req, 429, 'RATE_LIMITED', 'Rate limit exceeded'); }
      return next();
    } catch (_) { warn(req); return next(); }
  };
}
const healthPaths = new Set(['/health', '/ready', '/health/services', `${config.apiPrefix}/health`, `${config.apiPrefix}/ready`, `${config.apiPrefix}/health/services`]);
const defaultLimiter = rateLimit({ name: 'default', limit: config.rateLimitDefaultPerMin, keyFn: (req) => req.ip });
const loginLimiter = rateLimit({ name: 'login', limit: config.rateLimitLoginPerMin, keyFn: (req) => req.ip });
const bookingLimiter = rateLimit({ name: 'booking', limit: config.rateLimitBookingPerMin, keyFn: (req) => req.user.id });
function defaultRateLimit(req, res, next) { return healthPaths.has(req.path) || (req.method === 'POST' && req.path === `${config.apiPrefix}/auth/login`) ? next() : defaultLimiter(req, res, next); }
module.exports = { rateLimit, defaultRateLimit, defaultLimiter, loginLimiter, bookingLimiter };
