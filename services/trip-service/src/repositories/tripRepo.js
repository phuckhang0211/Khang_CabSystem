const { pool } = require('../db/pg');
async function insertFromAssigned(p) {
  await pool.query("INSERT INTO trips(id,booking_id,customer_id,driver_id,vehicle_id,payment_id,fare,paid_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (booking_id) DO NOTHING", [p.id,p.bookingId,p.customerId,p.driverId,p.vehicleId,p.paymentId,p.fare,p.paidAt]);
}
async function get(id) { const r=await pool.query('SELECT * FROM trips WHERE id=$1',[id]); return r.rows[0]||null; }
async function getByBooking(bookingId) { const r=await pool.query('SELECT * FROM trips WHERE booking_id=$1',[bookingId]); return r.rows[0]||null; }
module.exports={insertFromAssigned,get,getByBooking};
