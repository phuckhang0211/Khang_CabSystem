const express = require("express");
const { authenticate } = require("../middlewares/auth");
const { allow } = require("../middlewares/rbac");
const { validate } = require("../utils/validate");
const schemas = require("../schemas/booking");
const { createBookingController } = require("../controllers/bookingController");
function createBookingOfferRouter(clients) {
  const router = express.Router(),
    controller = createBookingController(clients);
  router.get("/me", authenticate, allow("DRIVER"), controller.listOffers);
  router.post(
    "/:id/accept",
    authenticate,
    allow("DRIVER"),
    validate(schemas.id, "params"),
    controller.accept,
  );
  router.post(
    "/:id/reject",
    authenticate,
    allow("DRIVER"),
    validate(schemas.id, "params"),
    validate(schemas.reject),
    controller.reject,
  );
  return router;
}
module.exports = { createBookingOfferRouter };
