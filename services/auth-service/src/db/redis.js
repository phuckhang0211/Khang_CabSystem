const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });

async function waitForRedis() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      if (redis.status === 'wait') await redis.connect();
      await redis.ping();
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`Redis connection attempt ${attempt} failed`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function closeRedis() {
  await redis.quit();
}

module.exports = { redis, waitForRedis, closeRedis };
