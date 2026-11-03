const fs = require("fs"),
  path = require("path"),
  { Client } = require("pg"),
  Redis = require("ioredis"),
  bcrypt = require("bcryptjs");
const { encrypt } = require("./lib/crypto"),
  { blindIndex } = require("./lib/blindIndex");
for (const l of fs
  .readFileSync(path.join(__dirname, "../.env"), "utf8")
  .split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i)] = l.slice(i + 1);
}
const id = (n) =>
  `00000000-0000-0000-0000-000000000${String(n).padStart(3, "0")}`;
const db = (n) =>
  new Client({
    host: process.env.SEED_PG_HOST,
    port: Number(process.env[`${n}_DB_DEBUG_PORT`]),
    user: process.env[`${n}_DB_USER`],
    password: process.env[`${n}_DB_PASSWORD`],
    database: process.env[`${n}_DB_NAME`],
  });
const users = [
  ["001", "admin@example.test", "+84900000001", "Admin@123", "ADMIN", "ACTIVE"],
  [
    "101",
    "customer1@example.test",
    "+84900000101",
    "Customer@123",
    "CUSTOMER",
    "ACTIVE",
  ],
  [
    "102",
    "customer2@example.test",
    "+84900000102",
    "Customer@123",
    "CUSTOMER",
    "ACTIVE",
  ],
  ...Array.from({ length: 7 }, (_, i) => [
    String(201 + i),
    `driver${i + 1}@example.test`,
    `+8490000020${i + 1}`,
    "Driver@123",
    "DRIVER",
    i === 6 ? "PENDING" : "ACTIVE",
  ]),
];
async function seedAuth() {
  const c = db("AUTH");
  await c.connect();
  try {
    for (const [n, email, phone, password, role, status] of users) {
      const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_COST));
      await c.query(
        "INSERT INTO users(id,email_enc,email_bidx,phone_enc,phone_bidx,password_hash,role,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET email_enc=EXCLUDED.email_enc,email_bidx=EXCLUDED.email_bidx,phone_enc=EXCLUDED.phone_enc,phone_bidx=EXCLUDED.phone_bidx,password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,status=EXCLUDED.status",
        [
          id(n),
          encrypt(email),
          blindIndex(email, "email"),
          encrypt(phone),
          blindIndex(phone, "phone"),
          hash,
          role,
          status,
        ],
      );
    }
  } finally {
    await c.end();
  }
}
async function seedCustomer() {
  const c = db("CUSTOMER");
  await c.connect();
  try {
    for (const [n, u, name] of [
      ["111", "101", "Customer One"],
      ["112", "102", "Customer Two"],
    ])
      await c.query(
        "INSERT INTO customer_profiles(id,user_id,display_name) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,display_name=EXCLUDED.display_name,updated_at=now()",
        [id(n), id(u), name],
      );
  } finally {
    await c.end();
  }
}
async function seedDriver() {
  const c = db("DRIVER");
  await c.connect();
  try {
    for (let i = 1; i <= 7; i++) {
      const d = id(210 + i),
        u = id(200 + i),
        v = id(800 + i),
        a = id(900 + i),
        approved = i < 7,
        plate = `51A-${10000 + i}`,
        license = `GPLX-${10000 + i}`;
      await c.query(
        "INSERT INTO driver_profiles(id,user_id,full_name,verification_status,work_status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,full_name=EXCLUDED.full_name,verification_status=EXCLUDED.verification_status,work_status=EXCLUDED.work_status",
        [
          d,
          u,
          `Driver ${i}`,
          approved ? "APPROVED" : "PENDING_REVIEW",
          [1, 2, 3, 5].includes(i) ? "ONLINE" : "OFFLINE",
        ],
      );
      await c.query(
        "INSERT INTO vehicles(id,driver_id,plate_number_enc,plate_bidx,vehicle_type,brand,model,color) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET driver_id=EXCLUDED.driver_id,plate_number_enc=EXCLUDED.plate_number_enc,plate_bidx=EXCLUDED.plate_bidx",
        [
          v,
          d,
          encrypt(plate),
          blindIndex(plate, "plate"),
          "CAR",
          "Toyota",
          "Vios",
          "White",
        ],
      );
      await c.query(
        "INSERT INTO driver_applications(id,driver_id,license_number_enc,license_bidx,status,reviewed_at,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET driver_id=EXCLUDED.driver_id,license_number_enc=EXCLUDED.license_number_enc,license_bidx=EXCLUDED.license_bidx,status=EXCLUDED.status,reviewed_at=EXCLUDED.reviewed_at,reviewed_by=EXCLUDED.reviewed_by",
        [
          a,
          d,
          encrypt(license),
          blindIndex(license, "license"),
          approved ? "APPROVED" : "PENDING_REVIEW",
          approved ? new Date() : null,
          approved ? id("001") : null,
        ],
      );
    }
  } finally {
    await c.end();
  }
}
async function seedRedis() {
  const r = new Redis(process.env.SEED_REDIS_URL),
    lat = Number(process.env.SEED_BASE_LAT),
    lng = Number(process.env.SEED_BASE_LNG),
    p = [
      [1, 0.003, 0, "ONLINE", "AVAILABLE"],
      [2, 0, 0.005, "ONLINE", "AVAILABLE"],
      [3, -0.004, 0, "ONLINE", "BUSY"],
      [4, 0.004, 0.004, "OFFLINE", "AVAILABLE"],
      [5, 0.022, 0, "ONLINE", "AVAILABLE"],
      [6, 0.002, 0.002, "OFFLINE", "BUSY"],
    ];
  try {
    for (const [n, dy, dx, w, a] of p) {
      const d = id(210 + n),
        y = lat + dy,
        x = lng + dx;
      await r.hset(`driver:${d}:state`, "workStatus", w, "availability", a);
      await r.hdel(`driver:${d}:state`, "currentBookingId", "currentTripId");
      await r.geoadd("drivers:geo", x, y, d);
      await r.hset(
        `driver:${d}:location`,
        "lat",
        String(y),
        "lng",
        String(x),
        "updatedAt",
        new Date().toISOString(),
      );
    }
    const pending = id(217);
    await r.del(`driver:${pending}:state`, `driver:${pending}:location`);
    await r.zrem("drivers:geo", pending);
  } finally {
    await r.quit();
  }
}
const history = [
  [301, 101, 10.7800, 106.6720, 2.40, 12000, "COMPLETED", 211, 3],
  [302, 101, 10.7900, 106.6800, 4.10, 20500, "COMPLETED", 212, 6],
  [303, 101, 10.7700, 106.6740, 1.80, 9000, "CANCELED", 211, 9],
  [304, 101, 10.7830, 106.6780, 3.00, 15000, "CANCELED", null, 12],
  [305, 101, 10.8000, 106.6900, 5.20, 26000, "NO_DRIVER_FOUND", null, 15],
  [306, 101, 10.7820, 106.6700, 2.70, 13500, "PAYMENT_FAILED", null, 18],
  [307, 102, 10.7770, 106.6700, 2.10, 10500, "COMPLETED", 212, 4],
];
const at = (hour, minute = 0) =>
  new Date(Date.UTC(2026, 8, 30, hour, minute)).toISOString();

async function seedBooking() {
  const c = db("BOOKING");
  await c.connect();
  try {
    for (const [n, customer, destLat, destLng, distance, fare, status, driver, hour] of history) {
      await c.query(
        `INSERT INTO bookings(id,customer_id,driver_id,payment_id,pickup_lat,pickup_lng,pickup_address,dest_lat,dest_lng,dest_address,distance_km,fare,status,assigned_at,canceled_at,cancel_reason,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT(id) DO UPDATE SET customer_id=EXCLUDED.customer_id,driver_id=EXCLUDED.driver_id,payment_id=EXCLUDED.payment_id,pickup_lat=EXCLUDED.pickup_lat,pickup_lng=EXCLUDED.pickup_lng,pickup_address=EXCLUDED.pickup_address,dest_lat=EXCLUDED.dest_lat,dest_lng=EXCLUDED.dest_lng,dest_address=EXCLUDED.dest_address,distance_km=EXCLUDED.distance_km,fare=EXCLUDED.fare,status=EXCLUDED.status,assigned_at=EXCLUDED.assigned_at,canceled_at=EXCLUDED.canceled_at,cancel_reason=EXCLUDED.cancel_reason,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at`,
        [id(n), id(customer), driver && id(driver), id(n + 100), 10.7626, 106.6602, null,
          destLat, destLng, null, distance, fare, status,
          driver ? at(hour, 10) : null, status === "CANCELED" ? at(hour, 30) : null,
          n === 303 ? "Khách thay đổi kế hoạch" : n === 304 ? "Khách hủy đặt xe" : null,
          at(hour), at(hour, 50)],
      );
    }
  } finally {
    await c.end();
  }
}

async function seedPayment() {
  const c = db("PAYMENT");
  await c.connect();
  try {
    for (const [n, customer, , , , fare, , , hour] of history) {
      const failed = n === 306;
      await c.query(
        `INSERT INTO payments(id,booking_id,customer_id,amount,currency,provider,status,provider_txn_id,payment_url,failure_code,created_at,paid_at,failed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT(id) DO UPDATE SET booking_id=EXCLUDED.booking_id,customer_id=EXCLUDED.customer_id,amount=EXCLUDED.amount,currency=EXCLUDED.currency,provider=EXCLUDED.provider,status=EXCLUDED.status,provider_txn_id=EXCLUDED.provider_txn_id,payment_url=EXCLUDED.payment_url,failure_code=EXCLUDED.failure_code,created_at=EXCLUDED.created_at,paid_at=EXCLUDED.paid_at,failed_at=EXCLUDED.failed_at`,
        [id(n + 100), id(n), id(customer), fare, "VND", "MOCK", failed ? "FAILED" : "COMPLETED",
          failed ? null : `SEED-TXN-${n + 100}`, `mock://pay/${id(n + 100)}`,
          failed ? "SEED_PAYMENT_FAILED" : null, at(hour, 1), failed ? null : at(hour, 5), failed ? at(hour, 5) : null],
      );
    }
  } finally {
    await c.end();
  }
}

async function seedTrip() {
  const c = db("TRIP");
  await c.connect();
  try {
    for (const [n, customer, destLat, destLng, , fare, , driver, hour] of history.filter((row) => [301, 302, 303, 307].includes(row[0]))) {
      const canceled = n === 303;
      await c.query(
        `INSERT INTO trips(id,booking_id,customer_id,driver_id,vehicle_id,payment_id,fare,status,payment_status,paid_at,last_lat,last_lng,location_updated_at,end_lat,end_lng,arrived_at,started_at,completed_at,canceled_at,canceled_by,cancel_reason,created_at,updated_at,pickup_lat,pickup_lng,pickup_address,dest_lat,dest_lng,dest_address)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
         ON CONFLICT(id) DO UPDATE SET booking_id=EXCLUDED.booking_id,customer_id=EXCLUDED.customer_id,driver_id=EXCLUDED.driver_id,vehicle_id=EXCLUDED.vehicle_id,payment_id=EXCLUDED.payment_id,fare=EXCLUDED.fare,status=EXCLUDED.status,payment_status=EXCLUDED.payment_status,paid_at=EXCLUDED.paid_at,last_lat=EXCLUDED.last_lat,last_lng=EXCLUDED.last_lng,location_updated_at=EXCLUDED.location_updated_at,end_lat=EXCLUDED.end_lat,end_lng=EXCLUDED.end_lng,arrived_at=EXCLUDED.arrived_at,started_at=EXCLUDED.started_at,completed_at=EXCLUDED.completed_at,canceled_at=EXCLUDED.canceled_at,canceled_by=EXCLUDED.canceled_by,cancel_reason=EXCLUDED.cancel_reason,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,pickup_lat=EXCLUDED.pickup_lat,pickup_lng=EXCLUDED.pickup_lng,pickup_address=EXCLUDED.pickup_address,dest_lat=EXCLUDED.dest_lat,dest_lng=EXCLUDED.dest_lng,dest_address=EXCLUDED.dest_address`,
        [id(n + 200), id(n), id(customer), id(driver), id(driver + 590), id(n + 100), fare,
          canceled ? "CANCELED" : "COMPLETED", "PAID", at(hour, 5),
          canceled ? null : destLat, canceled ? null : destLng, canceled ? null : at(hour, 40),
          canceled ? null : destLat, canceled ? null : destLng, at(hour, 20),
          canceled ? null : at(hour, 30), canceled ? null : at(hour, 50),
          canceled ? at(hour, 30) : null, canceled ? "CUSTOMER" : null,
          canceled ? "Khách thay đổi kế hoạch" : null, at(hour, 10), at(hour, 50),
          10.7626, 106.6602, null, destLat, destLng, null],
      );
    }
  } finally {
    await c.end();
  }
}

async function seedOffer() {
  const c = db("BOOKING");
  await c.connect();
  try {
    for (const [offer, booking, driver, hour] of [[701, 301, 211, 3], [702, 302, 212, 6], [703, 303, 211, 9], [704, 307, 212, 4]]) {
      await c.query(
        `INSERT INTO booking_offers(id,booking_id,driver_id,status,expires_at,responded_at,reject_reason,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(id) DO UPDATE SET booking_id=EXCLUDED.booking_id,driver_id=EXCLUDED.driver_id,status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,responded_at=EXCLUDED.responded_at,reject_reason=EXCLUDED.reject_reason,created_at=EXCLUDED.created_at`,
        [id(offer), id(booking), id(driver), "ACCEPTED", at(hour, 15), at(hour, 10), null, at(hour, 7)],
      );
    }
  } finally {
    await c.end();
  }
}

async function seedReview() {
  const c = db("CUSTOMER");
  await c.connect();
  try {
    await c.query(
      `INSERT INTO reviews(id,trip_id,customer_id,driver_id,rating,comment,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET trip_id=EXCLUDED.trip_id,customer_id=EXCLUDED.customer_id,driver_id=EXCLUDED.driver_id,rating=EXCLUDED.rating,comment=EXCLUDED.comment,created_at=EXCLUDED.created_at`,
      [id(601), id(501), id(101), id(211), 5, null, at(3, 55)],
    );
  } finally {
    await c.end();
  }
}
async function main() {
  await seedAuth();
  await seedCustomer();
  await seedDriver();
  await seedRedis();
  await seedBooking();
  await seedPayment();
  await seedTrip();
  await seedOffer();
  await seedReview();
  console.log("Seed complete: auth=10 customer=2 driver=7 booking=7 payment=7 trip=4 offer=4 review=1 redis=6");
}
if (require.main === module)
  main().catch((e) => {
    console.error(`Seed failed: ${e.message}`);
    process.exit(1);
  });
module.exports = { seedAuth, seedCustomer, seedDriver, seedRedis, seedBooking, seedPayment, seedTrip, seedOffer, seedReview };
