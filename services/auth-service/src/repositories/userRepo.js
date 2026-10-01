const { pool } = require('../db/pg');

async function findByEmailBlindIndex(emailBlindIndex) {
  const result = await pool.query(
    `SELECT id, email_enc, email_bidx, phone_enc, phone_bidx, password_hash, role, status
     FROM users WHERE email_bidx = $1`,
    [emailBlindIndex]
  );
  return result.rows[0] || null;
}

async function findByPhoneBlindIndex(phoneBlindIndex) {
  const result = await pool.query(
    `SELECT id, email_enc, email_bidx, phone_enc, phone_bidx, password_hash, role, status
     FROM users WHERE phone_bidx = $1`,
    [phoneBlindIndex]
  );
  return result.rows[0] || null;
}

async function findById(userId) {
  const result = await pool.query('SELECT id, role, status FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

async function createUser(user) {
  const result = await pool.query(
    `INSERT INTO users (id, email_enc, email_bidx, phone_enc, phone_bidx, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, role, status`,
    [user.id, user.emailEnc, user.emailBidx, user.phoneEnc, user.phoneBidx, user.passwordHash, user.role, user.status]
  );
  return result.rows[0];
}

async function setAccountStatus(userId, status) {
  const result = await pool.query(
    'UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, role, status',
    [userId, status]
  );
  return result.rows[0] || null;
}

module.exports = { findByEmailBlindIndex, findByPhoneBlindIndex, findById, createUser, setAccountStatus };
