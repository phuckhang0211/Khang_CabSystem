const { pool } = require('../db/pg');

async function createOrFind({ id, bookingId, customerId, amount, paymentUrl }) {
  const inserted = await pool.query(
    "INSERT INTO payments (id,booking_id,customer_id,amount,payment_url) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (booking_id) DO NOTHING RETURNING *",
    [id, bookingId, customerId, amount, paymentUrl]
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const found = await pool.query('SELECT * FROM payments WHERE booking_id=$1', [bookingId]);
  return found.rows[0];
}

async function findById(id) {
  const result = await pool.query('SELECT * FROM payments WHERE id=$1', [id]);
  return result.rows[0] || null;
}

async function beginCallback(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [id]);
    return { client, row: result.rows[0] || null };
  } catch (error) {
    client.release();
    throw error;
  }
}

async function transactionHasProviderTxn(transaction, providerTxnId) {
  const result = await transaction.client.query('SELECT 1 FROM payments WHERE provider_txn_id=$1 AND id<>$2', [providerTxnId, transaction.row.id]);
  return Boolean(result.rows[0]);
}

async function updateCallback(transaction, result) {
  if (result === 'SUCCESS') {
    const updated = await transaction.client.query(
      "UPDATE payments SET status='COMPLETED',provider_txn_id=$2,paid_at=now() WHERE id=$1 AND status='PENDING' RETURNING *",
      [transaction.row.id, transaction.providerTxnId]
    );
    return updated.rows[0] || null;
  }
  const updated = await transaction.client.query(
    "UPDATE payments SET status='FAILED',provider_txn_id=$2,failed_at=now(),failure_code='MOCK_PAYMENT_FAILED' WHERE id=$1 AND status='PENDING' RETURNING *",
    [transaction.row.id, transaction.providerTxnId]
  );
  return updated.rows[0] || null;
}

async function commit(transaction) { await transaction.client.query('COMMIT'); transaction.client.release(); }
async function rollback(transaction) { try { await transaction.client.query('ROLLBACK'); } finally { transaction.client.release(); } }

module.exports = { createOrFind, findById, beginCallback, transactionHasProviderTxn, updateCallback, commit, rollback };
