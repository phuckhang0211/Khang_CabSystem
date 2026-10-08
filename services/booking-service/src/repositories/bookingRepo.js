const { pool } = require("../db/pg");
async function idem(userId, key) {
  const r = await pool.query(
    "SELECT * FROM idempotency_keys WHERE user_id=$1 AND endpoint='POST /bookings' AND key=$2 AND expires_at>=now()",
    [userId, key],
  );
  return r.rows[0] || null;
}
async function insertBooking(x) {
  await pool.query(
    "INSERT INTO bookings (id,customer_id,pickup_lat,pickup_lng,pickup_address,dest_lat,dest_lng,dest_address,distance_km,fare) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      x.id,
      x.customerId,
      x.pickup.lat,
      x.pickup.lng,
      x.pickup.address,
      x.destination.lat,
      x.destination.lng,
      x.destination.address,
      x.distanceKm,
      x.fare,
    ],
  );
}
async function fail(id) {
  await pool.query(
    "UPDATE bookings SET status='PAYMENT_FAILED',updated_at=now() WHERE id=$1",
    [id],
  );
}
async function complete(x) {
  await pool.query(
    "UPDATE bookings SET payment_id=$2,updated_at=now() WHERE id=$1",
    [x.bookingId, x.paymentId],
  );
  try {
    await pool.query(
      "INSERT INTO idempotency_keys (id,key,user_id,request_hash,response_code,response_body,expires_at) VALUES ($1,$2,$3,$4,201,$5::jsonb,now()+interval '24 hours')",
      [x.id, x.key, x.customerId, x.hash, JSON.stringify(x.body)],
    );
    return null;
  } catch (e) {
    if (e.code !== "23505") throw e;
    return idem(x.customerId, x.key);
  }
}
async function get(id) {
  const r = await pool.query("SELECT * FROM bookings WHERE id=$1", [id]);
  return r.rows[0] || null;
}
async function markPaymentFailed(id) {
  const r = await pool.query(
    "UPDATE bookings SET status='PAYMENT_FAILED',updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING' RETURNING id",
    [id],
  );
  return r.rowCount === 1;
}
async function markSearching(id) {
  const r = await pool.query(
    "UPDATE bookings SET status='SEARCHING_DRIVER',updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING' RETURNING *",
    [id],
  );
  return r.rows[0] || null;
}
async function markNoDriverFound(id) {
  const r = await pool.query(
    "UPDATE bookings SET status='NO_DRIVER_FOUND',updated_at=now() WHERE id=$1 AND status='SEARCHING_DRIVER' RETURNING id",
    [id],
  );
  return r.rowCount === 1;
}
async function markTripCompleted(bookingId) {
  const result = await pool.query("UPDATE bookings SET status='COMPLETED',updated_at=now() WHERE id=$1 AND status='DRIVER_ASSIGNED' RETURNING id", [bookingId]);
  return result.rowCount === 1;
}
async function markTripCanceled(bookingId, reason) {
  const result = await pool.query("UPDATE bookings SET status='CANCELED',canceled_at=now(),cancel_reason=$2,updated_at=now() WHERE id=$1 AND status='DRIVER_ASSIGNED' RETURNING id", [bookingId, reason]);
  return result.rowCount === 1;
}
async function createOffers(bookingId, drivers, offerTtlSeconds) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const offers = [];
    for (const driver of drivers) {
      const r = await client.query(
        "INSERT INTO booking_offers (id,booking_id,driver_id,status,expires_at) VALUES ($1,$2,$3,'PENDING',now()+make_interval(secs => $4::integer)) ON CONFLICT (booking_id,driver_id) DO NOTHING RETURNING id,expires_at",
        [driver.offerId, bookingId, driver.driverId, offerTtlSeconds],
      );
      if (r.rowCount === 1)
        offers.push({
          ...driver,
          offerId: r.rows[0].id,
          expiresAt: new Date(r.rows[0].expires_at).toISOString(),
        });
    }
    await client.query("COMMIT");
    return offers;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function list({ customerId, status, page, limit }) {
  const args = [];
  let where = "";
  if (customerId) {
    args.push(customerId);
    where = `WHERE customer_id=$${args.length}`;
  }
  if (status) {
    args.push(status);
    where += `${where ? " AND" : "WHERE"} status=$${args.length}`;
  }
  const total = await pool.query(
    `SELECT count(*) FROM bookings ${where}`,
    args,
  );
  args.push(limit, (page - 1) * limit);
  const r = await pool.query(
    `SELECT * FROM bookings ${where} ORDER BY created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );
  return { rows: r.rows, total: Number(total.rows[0].count) };
}
async function listOffers(driverId) {
  const r = await pool.query(
    "SELECT o.id AS offer_id,o.status AS offer_status,o.expires_at,b.* FROM booking_offers o JOIN bookings b ON b.id=o.booking_id WHERE o.driver_id=$1 AND o.status='PENDING' AND b.status='SEARCHING_DRIVER' ORDER BY o.created_at DESC",
    [driverId],
  );
  return r.rows;
}
async function getOffer(id) {
  const r = await pool.query(
    "SELECT o.id AS offer_id,o.driver_id AS offer_driver_id,o.status AS offer_status,o.expires_at,b.* FROM booking_offers o JOIN bookings b ON b.id=o.booking_id WHERE o.id=$1",
    [id],
  );
  return r.rows[0] || null;
}
async function accept(offerId, driverId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT o.id AS offer_id,o.driver_id AS offer_driver_id,o.status AS offer_status,o.expires_at,b.* FROM booking_offers o JOIN bookings b ON b.id=o.booking_id WHERE o.id=$1",
      [offerId],
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return { kind: "NOT_FOUND" };
    }
    const row = found.rows[0];
    if (row.offer_driver_id !== driverId) {
      await client.query("ROLLBACK");
      return { kind: "FORBIDDEN" };
    }
    if (row.offer_status !== "PENDING" || row.status !== "SEARCHING_DRIVER") {
      await client.query("ROLLBACK");
      return { kind: "CONFLICT" };
    }
    if (new Date(row.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      return { kind: "EXPIRED" };
    }
    const updated = await client.query(
      "UPDATE bookings SET status='DRIVER_ASSIGNED',driver_id=$2,assigned_at=now(),updated_at=now() WHERE id=$1 AND status='SEARCHING_DRIVER' RETURNING *",
      [row.id, driverId],
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return { kind: "CONFLICT" };
    }
    await client.query(
      "UPDATE booking_offers SET status='ACCEPTED',responded_at=now() WHERE id=$1 AND status='PENDING'",
      [offerId],
    );
    const superseded = await client.query(
      "UPDATE booking_offers SET status='SUPERSEDED',responded_at=now() WHERE booking_id=$1 AND id<>$2 AND status='PENDING' RETURNING driver_id",
      [row.id, offerId],
    );
    await client.query("COMMIT");
    return {
      kind: "OK",
      booking: updated.rows[0],
      supersededDriverIds: superseded.rows.map((x) => x.driver_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function reject(offerId, driverId, reason) {
  const r = await pool.query(
    "UPDATE booking_offers SET status='REJECTED',responded_at=now(),reject_reason=$3 WHERE id=$1 AND driver_id=$2 AND status='PENDING' RETURNING id",
    [offerId, driverId, reason],
  );
  if (r.rowCount) return "OK";
  const offer = await getOffer(offerId);
  if (!offer) return "NOT_FOUND";
  return offer.offer_driver_id === driverId ? "CONFLICT" : "FORBIDDEN";
}
async function cancel(bookingId, customerId, reason) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE bookings SET status='CANCELED',canceled_at=now(),cancel_reason=$3,updated_at=now() WHERE id=$1 AND customer_id=$2 AND status IN ('PAYMENT_PENDING','SEARCHING_DRIVER') RETURNING *",
      [bookingId, customerId, reason],
    );
    if (!updated.rowCount) {
      const found = await client.query(
        "SELECT customer_id FROM bookings WHERE id=$1",
        [bookingId],
      );
      await client.query("ROLLBACK");
      return { kind: found.rowCount ? "CONFLICT" : "NOT_FOUND" };
    }
    const offers = await client.query(
      "UPDATE booking_offers SET status='SUPERSEDED',responded_at=now() WHERE booking_id=$1 AND status='PENDING' RETURNING driver_id",
      [bookingId],
    );
    await client.query("COMMIT");
    return {
      kind: "OK",
      booking: updated.rows[0],
      driverIds: offers.rows.map((x) => x.driver_id),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports = {
  idem,
  insertBooking,
  fail,
  complete,
  get,
  list,
  markPaymentFailed,
  markSearching,
  markNoDriverFound,
  markTripCompleted,
  markTripCanceled,
  createOffers,
  listOffers,
  getOffer,
  accept,
  reject,
  cancel,
};
