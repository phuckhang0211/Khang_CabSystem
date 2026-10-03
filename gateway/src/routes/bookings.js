const express = require("express"),
  { authenticate } = require("../middlewares/auth"),
  { allow } = require("../middlewares/rbac"),
  { bookingLimiter } = require("../middlewares/rateLimit"),
  { validate } = require("../utils/validate"),
  s = require("../schemas/booking"),
  { createBookingController } = require("../controllers/bookingController");
function createBookingRouter(c) {
  const r = express.Router(),
    x = createBookingController(c);
  r.post(
    "/",
    authenticate,
    allow("CUSTOMER"),
    bookingLimiter,
    validate(s.createBookingSchema),
    x.create,
  );
  r.get(
    "/",
    authenticate,
    allow("CUSTOMER", "ADMIN"),
    validate(s.list, "query"),
    x.list,
  );
  r.get(
    "/:id",
    authenticate,
    allow("CUSTOMER", "ADMIN"),
    validate(s.id, "params"),
    x.get,
  );
  r.post('/:id/cancel', authenticate, allow('CUSTOMER'), validate(s.id, 'params'), validate(s.cancel), x.cancel);
  return r;
}
module.exports = { createBookingRouter };
