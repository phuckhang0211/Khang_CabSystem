const { pool } = require('../db/pg');

async function create({ id, tripId, customerId, driverId, rating, comment }) {
  const result = await pool.query(
    'INSERT INTO reviews(id,trip_id,customer_id,driver_id,rating,comment) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [id, tripId, customerId, driverId, rating, comment]
  );
  return result.rows[0];
}

async function list(tripId, page, limit) {
  const count = await pool.query('SELECT count(*) FROM reviews WHERE trip_id=$1', [tripId]);
  const result = await pool.query(
    'SELECT * FROM reviews WHERE trip_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',
    [tripId, limit, (page - 1) * limit]
  );
  return { rows: result.rows, total: Number(count.rows[0].count) };
}

module.exports = { create, list };
