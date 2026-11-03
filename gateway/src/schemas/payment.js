const { z } = require('zod');
const { isUuid } = require('../utils/uuid');

const paymentIdParamsSchema = z.object({ id: z.string().refine(isUuid) });
const callbackSchema = z.object({
  paymentId: z.string().refine(isUuid),
  amount: z.number().int().positive(),
  result: z.enum(['SUCCESS', 'FAIL'])
});

module.exports = { paymentIdParamsSchema, callbackSchema };
