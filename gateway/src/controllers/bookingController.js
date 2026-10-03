const grpc = require("@grpc/grpc-js");
const { sendData, sendPaginated, sendError } = require("../utils/response");
const meta = (r) => ({
  correlationId: r.correlationId,
  userId: r.user.id,
  userRole: r.user.role,
});
function createBookingController(clients) {
  const safeDriver = (driver) => driver && ({ driverId: driver.driverId, fullName: driver.fullName, workStatus: driver.workStatus, availability: driver.availability, vehicle: { plateNumber: driver.vehicle.plateNumber, vehicleType: driver.vehicle.vehicleType, brand: driver.vehicle.brand, model: driver.vehicle.model, color: driver.vehicle.color } });
  const booking = (value) => ({ ...value, driver: safeDriver(value.driver) });
  return {
    create: async (r, s, n) => {
      const k = r.get("Idempotency-Key");
      if (!k || k.length > 120)
        return sendError(s, r, 400, "VALIDATION_ERROR", "Validation failed");
      try {
        const x = await clients.booking.call(
          "createBooking",
          { ...r.body, idempotencyKey: k },
          meta(r),
        );
        if (x.replayed) s.setHeader("Idempotent-Replayed", "true");
        return sendData(s, x, 201);
      } catch (e) {
        if (e.code === grpc.status.UNAVAILABLE)
          return sendError(
            s,
            r,
            503,
            "PAYMENT_SERVICE_UNAVAILABLE",
            "Payment service unavailable",
          );
        return n(e);
      }
    },
    get: async (r, s, n) => {
      try {
        return sendData(
          s,
          booking(await clients.booking.call(
            "getBooking",
            { bookingId: r.params.id },
            meta(r),
          )),
        );
      } catch (e) {
        return n(e);
      }
    },
    list: async (r, s, n) => {
      try {
        const x = await clients.booking.call("listBookings", r.query, meta(r));
        return sendPaginated(s, x.items.map(booking), {
          page: x.pageInfo.page,
          limit: x.pageInfo.limit,
          total: x.pageInfo.total,
          totalPages: x.pageInfo.totalPages,
        });
      } catch (e) {
        return n(e);
      }
    },
    listOffers: async (r, s, n) => { try { return sendData(s, await clients.booking.call('listMyOffers', {}, meta(r))); } catch (e) { return n(e); } },
    accept: async (r, s, n) => { try { return sendData(s, await clients.booking.call('acceptOffer', { offerId: r.params.id }, meta(r))); } catch (e) { return n(e); } },
    reject: async (r, s, n) => { try { return sendData(s, await clients.booking.call('rejectOffer', { offerId: r.params.id, ...r.body }, meta(r))); } catch (e) { return n(e); } },
    cancel: async (r, s, n) => { try { return sendData(s, await clients.booking.call('cancelBooking', { bookingId: r.params.id, ...r.body }, meta(r))); } catch (e) { return n(e); } },
  };
}
module.exports = { createBookingController };
