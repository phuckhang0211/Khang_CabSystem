const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool({ connectionString: config.databaseUrl });

async function waitForPostgres() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`Postgres connection attempt ${attempt} failed`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function runMigrations() {
  const sql = await fs.readFile(path.join(__dirname, '../../migrations/schema.sql'), 'utf8');
  if (sql.trim()) await pool.query(sql);
}

async function closePostgres() {
  await pool.end();
}

module.exports = { pool, waitForPostgres, runMigrations, closePostgres };

