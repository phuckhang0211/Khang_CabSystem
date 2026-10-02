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
  ...Array.from({ length: 6 }, (_, i) => [
    String(201 + i),
    `driver${i + 1}@example.test`,
    `+8490000020${i + 1}`,
    "Driver@123",
    "DRIVER",
    i === 5 ? "PENDING" : "ACTIVE",
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
    for (let i = 1; i <= 6; i++) {
      const d = id(210 + i),
        u = id(200 + i),
        v = id(800 + i),
        a = id(900 + i),
        approved = i < 6,
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
    ];
  try {
    for (const [n, dy, dx, w, a] of p) {
      const d = id(210 + n),
        y = lat + dy,
        x = lng + dx;
      await r.hset(`driver:${d}:state`, "workStatus", w, "availability", a);
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
    const six = id(216);
    await r.del(`driver:${six}:state`, `driver:${six}:location`);
    await r.zrem("drivers:geo", six);
  } finally {
    await r.quit();
  }
}
async function main() {
  await seedAuth();
  await seedCustomer();
  await seedDriver();
  await seedRedis();
  console.log("Seed complete: auth=9 customer=2 driver=6 redis=5");
}
if (require.main === module)
  main().catch((e) => {
    console.error(`Seed failed: ${e.message}`);
    process.exit(1);
  });
module.exports = { seedAuth, seedCustomer, seedDriver, seedRedis };
