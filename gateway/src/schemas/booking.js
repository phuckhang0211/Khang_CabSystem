const { z } = require("zod");
const { isUuid } = require("../utils/uuid");
const { paginationSchema } = require("../utils/validate");
const location = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional(),
});
const createBookingSchema = z.object({
  pickup: location,
  destination: location,
});
const id = z.object({ id: z.string().refine(isUuid) });
const statuses = [
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "SEARCHING_DRIVER",
  "NO_DRIVER_FOUND",
  "CANCELED",
  "COMPLETED",
  "DRIVER_ASSIGNED",
];
const list = paginationSchema.extend({
  status: z.enum(statuses).optional(),
  customerId: z.string().refine(isUuid).optional(),
});
const reject = z.object({ reason: z.string().max(200).optional() });
const cancel = z.object({
  reason: z.string(),
  confirm: z.boolean().optional(),
});
module.exports = { createBookingSchema, id, list, reject, cancel };
