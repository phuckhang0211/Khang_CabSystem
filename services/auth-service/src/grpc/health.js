const { authenticatedUnary } = require('../utils/grpcAuth');
const { pool } = require('../db/pg');
const { redis } = require('../db/redis');

async function dependenciesHealthy() {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    return true;
  } catch (_) {
    return false;
  }
}

function createHealthHandler() {
  return {
    Check: authenticatedUnary(async (_call, callback) => {
      const healthy = await dependenciesHealthy();
      callback(null, { status: healthy ? 'SERVING' : 'NOT_SERVING' });
    })
  };
}

module.exports = { createHealthHandler };
