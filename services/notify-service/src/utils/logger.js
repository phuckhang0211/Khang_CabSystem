const config = require('../config');

function log(level, msg, correlationId) {
  process.stdout.write(`${JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: config.serviceName,
    correlationId: correlationId || null,
    msg
  })}\n`);
}

module.exports = {
  info: (msg, correlationId) => log('info', msg, correlationId),
  warn: (msg, correlationId) => log('warn', msg, correlationId),
  error: (msg, correlationId) => log('error', msg, correlationId)
};

