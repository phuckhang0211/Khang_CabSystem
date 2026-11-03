const { pool } = require('../db/pg');
async function insertFromAssigned(p) {
  await pool.query("INSERT INTO trips(id,booking_id,customer_id,driver_id,vehicle_id,payment_id,fare,paid_at,pickup_lat,pickup_lng,pickup_address,dest_lat,dest_lng,dest_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (booking_id) DO NOTHING", [p.id,p.bookingId,p.customerId,p.driverId,p.vehicleId,p.paymentId,p.fare,p.paidAt,p.pickup && p.pickup.lat,p.pickup && p.pickup.lng,p.pickup && p.pickup.address,p.destination && p.destination.lat,p.destination && p.destination.lng,p.destination && p.destination.address]);
}
async function get(id) { const r=await pool.query('SELECT * FROM trips WHERE id=$1',[id]); return r.rows[0]||null; }
async function getByBooking(bookingId) { const r=await pool.query('SELECT * FROM trips WHERE booking_id=$1',[bookingId]); return r.rows[0]||null; }
async function transition(id, from, to, timestampColumn) {
  const statements = {
    arrived_at: "UPDATE trips SET status=$3, arrived_at=now(), updated_at=now() WHERE id=$1 AND status=$2 RETURNING *",
    started_at: "UPDATE trips SET status=$3, started_at=now(), updated_at=now() WHERE id=$1 AND status=$2 RETURNING *",
    completed_at: "UPDATE trips SET status=$3, completed_at=now(), end_lat=last_lat, end_lng=last_lng, updated_at=now() WHERE id=$1 AND status=$2 RETURNING *"
  };
  const result = await pool.query(statements[timestampColumn], [id, from, to]);
  return result.rows[0] || null;
}
async function updateLocation(id, lat, lng) {
  const result = await pool.query("UPDATE trips SET last_lat=$2,last_lng=$3,location_updated_at=now(),updated_at=now() WHERE id=$1 AND status='IN_PROGRESS' RETURNING *", [id, lat, lng]);
  return result.rows[0] || null;
}
async function cancel(id, canceledBy, reason) {
  const result = await pool.query("UPDATE trips SET status='CANCELED',canceled_by=$2,canceled_at=now(),cancel_reason=$3,updated_at=now() WHERE id=$1 AND status IN ('DRIVER_ARRIVING','DRIVER_ARRIVED') RETURNING *", [id, canceledBy, reason]);
  return result.rows[0] || null;
}
module.exports={insertFromAssigned,get,getByBooking,transition,updateLocation,cancel};
