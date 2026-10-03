const grpc = require("@grpc/grpc-js"),
  { authenticatedUnary } = require("../utils/grpcAuth"),
  { makeError } = require("../utils/errors"),
  service = require("../services/bookingService");
const caller = (c) => ({
  userId: c.metadata.get("x-user-id")[0],
  role: c.metadata.get("x-user-role")[0],
  correlationId: c.metadata.get("x-correlation-id")[0],
});
function unary(method) {
  return authenticatedUnary((c, cb) =>
    Promise.resolve(method(c.request, caller(c)))
      .then((x) => cb(null, x))
      .catch((e) => cb(e)),
  );
}
function createBookingHandler(def) {
  const f = Object.fromEntries(
    Object.keys(def).map((k) => [
      k,
      authenticatedUnary((_c, cb) =>
        cb(
          makeError(
            grpc.status.UNIMPLEMENTED,
            "UNIMPLEMENTED",
            "RPC is not implemented",
          ),
        ),
      ),
    ]),
  );
  return {
    ...f,
    CreateBooking: unary(service.create),
    GetBooking: unary(service.get),
    ListBookings: unary(service.list),
    ListMyOffers: unary((_r, current) => service.listMyOffers(current)),
    AcceptOffer: unary(service.acceptOffer),
    RejectOffer: unary(service.rejectOffer),
    CancelBooking: unary(service.cancelBooking),
  };
}
module.exports = { createBookingHandler };
