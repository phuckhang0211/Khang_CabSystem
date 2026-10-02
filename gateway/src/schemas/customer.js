const { z } = require('zod');
const { isUuid } = require('../utils/uuid');
const updateCustomerSchema = z.object({ displayName: z.string() });
const customerIdParamsSchema = z.object({ id: z.string().refine(isUuid) });
module.exports = { updateCustomerSchema, customerIdParamsSchema };
