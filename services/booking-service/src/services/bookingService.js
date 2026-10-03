const crypto = require("crypto"),
  grpc = require("@grpc/grpc-js");
const repo = require("../repositories/bookingRepo"),
  payment = require("../clients/paymentClient"),
  driver = require("../clients/driverClient");
const { publish } = require("../events/rabbit");
const { escapeHtml } = require("../utils/escapeHtml");
const { isUuid } = require("../utils/uuid");
const { makeError } = require("../utils/errors");
const config = require("../config");
const err = (code, name, msg) => makeError(code, name, msg),
  inflight = new Map();
const statuses = [
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  "NO_DRIVER_FOUND",
  "CANCELED",
  "COMPLETED",
];
function loc(x) {
  if (
    !x ||
    !Number.isFinite(x.lat) ||
    !Number.isFinite(x.lng) ||
    x.lat < -90 ||
    x.lat > 90 ||
    x.lng < -180 ||
    x.lng > 180
  )
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "INVALID_COORDINATES",
      "Invalid coordinates",
    );
  const a = typeof x.address === "string" ? x.address.trim() : "";
  return { lat: x.lat, lng: x.lng, address: a || null };
}
function hash(p, d) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ pickup: p, destination: d }))
    .digest("hex");
}
function hav(p, d) {
  const rad = (x) => (x * Math.PI) / 180;
  const a =
    Math.sin(rad(d.lat - p.lat) / 2) ** 2 +
    Math.cos(rad(p.lat)) *
      Math.cos(rad(d.lat)) *
      Math.sin(rad(d.lng - p.lng) / 2) ** 2;
  return (
    Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) /
    100
  );
}
function view(r) {
  return {
    bookingId: r.id,
    customerId: r.customer_id,
    status: r.status,
    pickup: {
      lat: r.pickup_lat,
      lng: r.pickup_lng,
      address: r.pickup_address || "",
    },
    destination: {
      lat: r.dest_lat,
      lng: r.dest_lng,
      address: r.dest_address || "",
    },
    distanceKm: Number(r.distance_km),
    fare: Number(r.fare),
    paymentId: r.payment_id || "",
    driver: null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
async function createOnce(input, caller, pickup, destination, requestHash) {
  const old = await repo.idem(caller.userId, input.idempotencyKey);
  if (old) {
    if (old.request_hash !== requestHash)
      throw err(
        grpc.status.FAILED_PRECONDITION,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency key was reused",
      );
    return { ...old.response_body, replayed: true };
  }
  const distanceKm = hav(pickup, destination),
    fare = Math.round(distanceKm * config.pricePerKm);
  if (fare <= 0)
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "INVALID_COORDINATES",
      "Invalid coordinates",
    );
  const id = crypto.randomUUID();
  await repo.insertBooking({
    id,
    customerId: caller.userId,
    pickup: {
      ...pickup,
      address: pickup.address && escapeHtml(pickup.address),
    },
    destination: {
      ...destination,
      address: destination.address && escapeHtml(destination.address),
    },
    distanceKm,
    fare,
  });
  let p;
  try {
    p = await payment.createPayment(
      { bookingId: id, customerId: caller.userId, amount: fare },
      caller.correlationId,
    );
  } catch (_) {
    await repo.fail(id);
    throw err(
      grpc.status.UNAVAILABLE,
      "PAYMENT_SERVICE_UNAVAILABLE",
      "Payment service unavailable",
    );
  }
  const body = {
    bookingId: id,
    status: "PAYMENT_PENDING",
    distanceKm,
    fare,
    paymentId: p.paymentId,
    paymentUrl: p.paymentUrl,
    replayed: false,
  };
  const saved = await repo.complete({
    id: crypto.randomUUID(),
    key: input.idempotencyKey,
    customerId: caller.userId,
    hash: requestHash,
    bookingId: id,
    paymentId: p.paymentId,
    body,
  });
  return saved && saved.response_body
    ? { ...saved.response_body, replayed: true }
    : body;
}
async function create(input, caller) {
  if (caller.role !== "CUSTOMER" || !caller.userId)
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 1 ||
    input.idempotencyKey.length > 120
  )
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid idempotency key",
    );
  const pickup = loc(input.pickup),
    destination = loc(input.destination),
    requestHash = hash(pickup, destination),
    key = `${caller.userId}:${input.idempotencyKey}`,
    current = inflight.get(key);
  if (current) return current.then((x) => ({ ...x, replayed: true }));
  const task = createOnce(input, caller, pickup, destination, requestHash);
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
async function enrich(row, correlationId) {
  const result = view(row);
  if (row.driver_id) {
    try {
      result.driver = await driver.getDriver(
        { driverId: row.driver_id },
        correlationId,
      );
    } catch (_) {
      result.driver = null;
    }
  }
  return result;
}
async function get({ bookingId }, caller) {
  if (!isUuid(bookingId))
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid booking id",
    );
  const row = await repo.get(bookingId);
  if (!row) throw err(grpc.status.NOT_FOUND, "NOT_FOUND", "Booking not found");
  if (
    !caller.userId ||
    !(
      caller.role === "ADMIN" ||
      (caller.role === "CUSTOMER" && row.customer_id === caller.userId)
    )
  )
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  return enrich(row, caller.correlationId);
}
async function list(input, caller) {
  if (!caller.userId || !["CUSTOMER", "ADMIN"].includes(caller.role))
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  if (input.status && !statuses.includes(input.status))
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid status",
    );
  const page = input.page || 1,
    limit = input.limit || 10;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid pagination",
    );
  const r = await repo.list({
    customerId: caller.role === "CUSTOMER" ? caller.userId : input.customerId,
    status: input.status,
    page,
    limit,
  });
  return {
    items: r.rows.map(view),
    pageInfo: {
      page,
      limit,
      total: r.total,
      totalPages: Math.ceil(r.total / limit),
    },
  };
}
async function resolveDriver(caller) {
  if (caller.role !== "DRIVER" || !caller.userId)
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  try {
    return await driver.getDriver(
      { userId: caller.userId },
      caller.correlationId,
    );
  } catch (_) {
    throw err(grpc.status.NOT_FOUND, "NOT_FOUND", "Driver not found");
  }
}
async function listMyOffers(caller) {
  const d = await resolveDriver(caller);
  const rows = await repo.listOffers(d.driverId);
  return {
    items: rows.map((row) => ({
      offerId: row.offer_id,
      status: row.offer_status,
      booking: {
        ...view(row),
        driver: null,
        createdAt: new Date(row.created_at).toISOString(),
      },
      expiresAt: new Date(row.expires_at).toISOString(),
    })),
  };
}
async function acceptOffer({ offerId }, caller) {
  if (!isUuid(offerId))
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid offer id",
    );
  const d = await resolveDriver(caller);
  const offer = await repo.getOffer(offerId);
  if (!offer) throw err(grpc.status.NOT_FOUND, "NOT_FOUND", "Offer not found");
  if (offer.offer_driver_id !== d.driverId)
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  if (offer.offer_status !== "PENDING" || offer.status !== "SEARCHING_DRIVER")
    throw err(grpc.status.ABORTED, "STATE_CONFLICT", "Offer state conflict");
  if (new Date(offer.expires_at) <= new Date())
    throw err(
      grpc.status.FAILED_PRECONDITION,
      "OFFER_EXPIRED",
      "Offer expired",
    );
  let assigned;
  try {
    assigned = await driver.tryAssignDriver(
      { driverId: d.driverId, bookingId: offer.id },
      caller.correlationId,
    );
  } catch (_) {
    throw err(
      grpc.status.UNAVAILABLE,
      "SERVICE_UNAVAILABLE",
      "Driver service unavailable",
    );
  }
  if (!assigned.assigned)
    throw err(grpc.status.ABORTED, "STATE_CONFLICT", "Driver unavailable");
  let result;
  try {
    result = await repo.accept(offerId, d.driverId);
  } catch (_) {
    await driver
      .releaseDriver(
        { driverId: d.driverId, bookingId: offer.id },
        caller.correlationId,
      )
      .catch(() => {});
    throw err(
      grpc.status.UNAVAILABLE,
      "SERVICE_UNAVAILABLE",
      "Booking service unavailable",
    );
  }
  if (result.kind !== "OK") {
    await driver
      .releaseDriver(
        { driverId: d.driverId, bookingId: offer.id },
        caller.correlationId,
      )
      .catch(() => {});
    if (result.kind === "EXPIRED")
      throw err(
        grpc.status.FAILED_PRECONDITION,
        "OFFER_EXPIRED",
        "Offer expired",
      );
    if (result.kind === "NOT_FOUND")
      throw err(grpc.status.NOT_FOUND, "NOT_FOUND", "Offer not found");
    if (result.kind === "FORBIDDEN")
      throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
    throw err(grpc.status.ABORTED, "STATE_CONFLICT", "Offer state conflict");
  }
  const supersededDriverUserIds = [];
  for (const id of result.supersededDriverIds) {
    try {
      const item = await driver.getDriver(
        { driverId: id },
        caller.correlationId,
      );
      supersededDriverUserIds.push(item.userId);
    } catch (_) {}
  }
  let paidAt = "";
  try {
    const p = await payment.getPayment(
      { paymentId: result.booking.payment_id },
      caller.correlationId,
    );
    paidAt = p.paidAt || "";
  } catch (_) {}
  await publish(
    "booking.assigned",
    {
      bookingId: result.booking.id,
      customerId: result.booking.customer_id,
      driverId: d.driverId,
      driverUserId: assigned.driverUserId,
      vehicleId: assigned.vehicleId,
      pickup: {
        lat: Number(result.booking.pickup_lat),
        lng: Number(result.booking.pickup_lng),
        address: result.booking.pickup_address || "",
      },
      destination: {
        lat: Number(result.booking.dest_lat),
        lng: Number(result.booking.dest_lng),
        address: result.booking.dest_address || "",
      },
      fare: Number(result.booking.fare),
      paymentId: result.booking.payment_id,
      paidAt,
      supersededDriverUserIds,
    },
    { correlationId: caller.correlationId, aggregateId: result.booking.id },
  );
  return { bookingId: result.booking.id, status: "DRIVER_ASSIGNED" };
}
async function rejectOffer({ offerId, reason }, caller) {
  if (!isUuid(offerId))
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid offer id",
    );
  if (typeof reason === "string" && reason.length > 200)
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid reject reason",
    );
  const d = await resolveDriver(caller);
  const result = await repo.reject(
    offerId,
    d.driverId,
    typeof reason === "string" ? escapeHtml(reason) : null,
  );
  if (result === "NOT_FOUND")
    throw err(grpc.status.NOT_FOUND, "NOT_FOUND", "Offer not found");
  if (result === "FORBIDDEN")
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  if (result === "CONFLICT")
    throw err(grpc.status.ABORTED, "STATE_CONFLICT", "Offer state conflict");
  return { offerId, status: "REJECTED" };
}
async function cancelBooking({ bookingId, reason, confirm }, caller) {
  if (caller.role !== "CUSTOMER" || !caller.userId)
    throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
  if (!isUuid(bookingId))
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid booking id",
    );
  if (confirm !== true)
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "CONFIRM_REQUIRED",
      "Confirmation required",
    );
  if (
    typeof reason !== "string" ||
    reason.trim().length < 5 ||
    reason.trim().length > 200
  )
    throw err(
      grpc.status.INVALID_ARGUMENT,
      "VALIDATION_ERROR",
      "Invalid cancel reason",
    );
  const result = await repo.cancel(
    bookingId,
    caller.userId,
    escapeHtml(reason.trim()),
  );
  if (result.kind === "NOT_FOUND")
    throw err(grpc.status.NOT_FOUND, "NOT_FOUND", "Booking not found");
  if (result.kind === "CONFLICT") {
    const existing = await repo.get(bookingId);
    if (existing && existing.customer_id !== caller.userId)
      throw err(grpc.status.PERMISSION_DENIED, "FORBIDDEN", "Access denied");
    throw err(grpc.status.ABORTED, "STATE_CONFLICT", "Booking state conflict");
  }
  const driverUserIds = [];
  for (const id of result.driverIds) {
    try {
      driverUserIds.push(
        (await driver.getDriver({ driverId: id }, caller.correlationId)).userId,
      );
    } catch (_) {}
  }
  await publish(
    "booking.canceled",
    {
      bookingId,
      customerId: caller.userId,
      driverUserIds,
      reason: escapeHtml(reason.trim()),
    },
    { correlationId: caller.correlationId, aggregateId: bookingId },
  );
  return { bookingId, status: "CANCELED" };
}
module.exports = {
  create,
  get,
  list,
  listMyOffers,
  acceptOffer,
  rejectOffer,
  cancelBooking,
};
