const { z } = require('zod');
const { isUuid } = require('../utils/uuid');
const { paginationSchema } = require('../utils/validate');

const create = z.object({
  tripId: z.string().refine(isUuid),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional()
}).strict();
const list = paginationSchema.extend({ tripId: z.string().refine(isUuid) });

module.exports = { create, list };
