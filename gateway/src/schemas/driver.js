const { z } = require('zod');
const { isUuid } = require('../utils/uuid');
const { paginationSchema } = require('../utils/validate');

const verificationStatuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'];
const workStatuses = ['ONLINE', 'OFFLINE'];
const availabilityStatuses = ['AVAILABLE', 'BUSY'];

const driverIdParamsSchema = z.object({ id: z.string().refine(isUuid) });
const applicationIdParamsSchema = z.object({ id: z.string().refine(isUuid) });
const submitApplicationSchema = z.object({
  email: z.string(),
  password: z.string(),
  fullName: z.string(),
  licenseNumber: z.string()
});
const applicationListSchema = paginationSchema.extend({
  status: z.enum(verificationStatuses).optional()
});
const rejectApplicationSchema = z.object({ reason: z.string().min(5).max(500) });
const workStatusSchema = z.object({ status: z.enum(workStatuses) });
const locationSchema = z.object({ lat: z.number(), lng: z.number() });
const nearbyDriversSchema = paginationSchema.extend({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radiusKm: z.coerce.number().positive().max(50).default(1),
  workStatus: z.enum(workStatuses).optional(),
  availability: z.enum(availabilityStatuses).optional()
});

module.exports = {
  driverIdParamsSchema,
  applicationIdParamsSchema,
  submitApplicationSchema,
  applicationListSchema,
  rejectApplicationSchema,
  workStatusSchema,
  locationSchema,
  nearbyDriversSchema
};
