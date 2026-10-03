const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const repo = require('../repositories/notificationRepo');
const { makeError } = require('../utils/errors');
const { isUuid } = require('../utils/uuid');

function add(event, recipientId, recipientRole, type, title, body, data) {
  if (!isUuid(event.eventId) || !isUuid(recipientId)) throw new Error('Invalid notification event');
  return repo.insert({ id: crypto.randomUUID(), recipientId, recipientRole, type, title, body, data, eventId: event.eventId });
}

async function consume(event) {
  if (!event || !event.payload || !isUuid(event.eventId) || typeof event.eventType !== 'string') throw new Error('Invalid notification event');
  const data = event.payload;
  const notify = (role, id, type, title, body, value) => add(event, id, role, type, title, body, value);
  switch (event.eventType) {
    case 'booking.offer.created':
      return notify('DRIVER', data.driverUserId, 'BOOKING_OFFER', 'Có chuyến mới', `Điểm đón: ${(data.pickup && data.pickup.address) || `${data.pickup?.lat},${data.pickup?.lng}`}. Cước: ${data.fare} VND`, { offerId: data.offerId, bookingId: data.bookingId });
    case 'booking.assigned':
      await notify('CUSTOMER', data.customerId, 'BOOKING_ASSIGNED', 'Đã có tài xế nhận chuyến', 'Đã có tài xế nhận chuyến', { bookingId: data.bookingId, driverId: data.driverId });
      await notify('DRIVER', data.driverUserId, 'BOOKING_ASSIGNED', 'Bạn đã nhận chuyến', 'Bạn đã nhận chuyến', { bookingId: data.bookingId });
      return Promise.all((data.supersededDriverUserIds || []).map((id) => notify('DRIVER', id, 'OFFER_CLOSED', 'Chuyến đã có tài xế khác nhận', 'Chuyến đã có tài xế khác nhận', { bookingId: data.bookingId })));
    case 'booking.canceled':
      return Promise.all([data.customerId, ...(data.driverUserIds || [])].map((id, index) => notify(index ? 'DRIVER' : 'CUSTOMER', id, 'BOOKING_CANCELED', 'Chuyến đã bị hủy', 'Chuyến đã bị hủy', { bookingId: data.bookingId, reason: data.reason })));
    case 'payment.completed': return notify('CUSTOMER', data.customerId, 'PAYMENT_COMPLETED', 'Thanh toán thành công', 'Thanh toán thành công', { paymentId: data.paymentId, bookingId: data.bookingId });
    case 'payment.failed': return notify('CUSTOMER', data.customerId, 'PAYMENT_FAILED', 'Thanh toán thất bại', 'Thanh toán thất bại', { paymentId: data.paymentId, bookingId: data.bookingId });
    case 'trip.arrived': return notify('CUSTOMER', data.customerId, 'TRIP_ARRIVED', 'Tài xế đã đến', 'Tài xế đã đến', { tripId: data.tripId, bookingId: data.bookingId });
    case 'trip.started': return notify('CUSTOMER', data.customerId, 'TRIP_STARTED', 'Chuyến đi đã bắt đầu', 'Chuyến đi đã bắt đầu', { tripId: data.tripId, bookingId: data.bookingId });
    case 'trip.completed': return notify('CUSTOMER', data.customerId, 'TRIP_COMPLETED', 'Chuyến đi hoàn thành', 'Chuyến đi hoàn thành', { tripId: data.tripId, bookingId: data.bookingId });
    case 'trip.canceled': return Promise.all([data.customerId, data.driverUserId].map((id, index) => notify(index ? 'DRIVER' : 'CUSTOMER', id, 'TRIP_CANCELED', 'Chuyến đi đã bị hủy', 'Chuyến đi đã bị hủy', { tripId: data.tripId, canceledBy: data.canceledBy, reason: data.reason })));
    case 'driver.approved': return notify('DRIVER', data.userId, 'DRIVER_APPROVED', 'Hồ sơ đã được duyệt', 'Hồ sơ đã được duyệt', { driverId: data.driverId });
    case 'driver.rejected': return notify('DRIVER', data.userId, 'DRIVER_REJECTED', 'Hồ sơ bị từ chối', 'Hồ sơ bị từ chối', { driverId: data.driverId, reason: data.reason });
    default: return undefined;
  }
}

async function list(userId, request) {
  const page = request.page || 1, limit = request.limit || 10;
  if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1 || limit > 50) throw makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Validation failed');
  const result = await repo.list(userId, request.unread, page, limit);
  return { items: result.items, pageInfo: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) } };
}

async function markRead(userId, notificationId) {
  if (!isUuid(notificationId)) throw makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Invalid notification id');
  const result = await repo.read(notificationId, userId);
  if (result === 'NOT_FOUND') throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'Notification not found');
  if (result === 'FORBIDDEN') throw makeError(grpc.status.PERMISSION_DENIED, 'FORBIDDEN', 'Forbidden');
  return { ok: true };
}

module.exports = { consume, list, markRead, markAll: (userId) => repo.readAll(userId).then(() => ({ ok: true })) };
