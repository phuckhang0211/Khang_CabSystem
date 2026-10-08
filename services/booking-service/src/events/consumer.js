const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const repo = require('../repositories/bookingRepo');
const driver = require('../clients/driverClient');
const { publish } = require('./rabbit');
const { isUuid } = require('../utils/uuid');

const RETRIES = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(action) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try { return await action(); } catch (error) { lastError = error; if (attempt < RETRIES) await sleep(attempt * 100); }
  }
  throw lastError;
}

function validPaymentEvent(event) {
  return event && typeof event.correlationId === 'string' && event.payload &&
    typeof event.payload.bookingId === 'string' &&
    (event.eventType !== 'payment.completed' || typeof event.payload.paymentId === 'string');
}
function validTripEvent(event) {
  return event && event.payload && isUuid(event.payload.bookingId) &&
    (event.eventType !== 'trip.canceled' || typeof event.payload.reason === 'string');
}

function pickup(row) { return { lat: Number(row.pickup_lat), lng: Number(row.pickup_lng), address: row.pickup_address || '' }; }
function destination(row) { return { lat: Number(row.dest_lat), lng: Number(row.dest_lng), address: row.dest_address || '' }; }

async function handleCompleted(event) {
  const booking = await retry(() => repo.markSearching(event.payload.bookingId));
  if (!booking) { logger.info('payment.completed ignored because booking is not pending', event.correlationId); return; }
  let nearby;
  try {
    nearby = await retry(() => driver.searchNearbyDrivers({
      lat: Number(booking.pickup_lat), lng: Number(booking.pickup_lng), radiusKm: config.matchRadiusKm,
      workStatus: 'ONLINE', availability: 'AVAILABLE', page: 1, limit: config.matchMaxOffers
    }, event.correlationId));
  } catch (_) {
    await retry(() => repo.markNoDriverFound(booking.id));
    logger.error('Driver search failed; booking marked NO_DRIVER_FOUND', event.correlationId);
    return;
  }
  const candidates = (nearby.items || []).slice(0, config.matchMaxOffers).map((item) => ({
    offerId: crypto.randomUUID(), driverId: item.driver.driverId, driverUserId: item.driver.userId
  })).filter((item) => item.driverId && item.driverUserId);
  if (!candidates.length) { await retry(() => repo.markNoDriverFound(booking.id)); return; }
  const offers = await retry(() => repo.createOffers(booking.id, candidates, config.offerTtlSeconds));
  const eventPickup = pickup(booking), eventDestination = destination(booking);
  for (const offer of offers) {
    await publish('booking.offer.created', {
      offerId: offer.offerId, bookingId: booking.id, driverId: offer.driverId, driverUserId: offer.driverUserId,
      pickup: eventPickup, destination: eventDestination, distanceKm: Number(booking.distance_km), fare: Number(booking.fare), expiresAt: offer.expiresAt
    }, { correlationId: event.correlationId, aggregateId: booking.id });
  }
}

async function handle(event) {
  if (event.eventType === 'payment.completed') { if (!validPaymentEvent(event)) return false; await handleCompleted(event); return true; }
  if (event.eventType === 'payment.failed') { if (!validPaymentEvent(event)) return false; await retry(() => repo.markPaymentFailed(event.payload.bookingId)); return true; }
  if (event.eventType === 'trip.completed') { if (!validTripEvent(event)) return false; await retry(() => repo.markTripCompleted(event.payload.bookingId)); return true; }
  if (event.eventType === 'trip.canceled') { if (!validTripEvent(event)) return false; await retry(() => repo.markTripCanceled(event.payload.bookingId, event.payload.reason)); return true; }
  return false;
}

function startConsumer(consume) {
  return consume('booking.q', ['payment.completed', 'payment.failed', 'trip.completed', 'trip.canceled'], async (event) => {
    try {
      const handled = await handle(event);
      if (!handled) logger.warn('Invalid or unsupported booking event acknowledged', event && event.correlationId);
    } catch (_) {
      if (event && (event.eventType === 'trip.completed' || event.eventType === 'trip.canceled')) throw _;
      logger.error('Booking event failed after retries and was acknowledged', event && event.correlationId);
    }
  }, { prefetch: 10 });
}

module.exports = { startConsumer };
