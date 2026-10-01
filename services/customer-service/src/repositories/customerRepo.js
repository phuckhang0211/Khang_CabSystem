const { pool } = require('../db/pg');

const profileFields = 'id, user_id, display_name, created_at';

async function findByUserId(userId) {
  const result = await pool.query(`SELECT ${profileFields} FROM customer_profiles WHERE user_id = $1`, [userId]);
  return result.rows[0] || null;
}

async function createOrFindProfile({ id, userId, displayName }) {
  const inserted = await pool.query(
    `INSERT INTO customer_profiles (id, user_id, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING ${profileFields}`,
    [id, userId, displayName]
  );
  return inserted.rows[0] || findByUserId(userId);
}

async function updateDisplayName(userId, displayName) {
  const result = await pool.query(
    `UPDATE customer_profiles SET display_name = $2, updated_at = now()
     WHERE user_id = $1 RETURNING ${profileFields}`,
    [userId, displayName]
  );
  return result.rows[0] || null;
}

module.exports = { createOrFindProfile, findByUserId, updateDisplayName };
