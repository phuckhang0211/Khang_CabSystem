const { authenticatedUnary } = require('../utils/grpcAuth');
const { pool } = require('../db/pg');

async function dependenciesHealthy() {
  try {
    await pool.query('SELECT 1');
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

