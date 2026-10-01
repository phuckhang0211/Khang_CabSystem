const { z } = require('zod');
const updateCustomerSchema = z.object({ displayName: z.string() });
module.exports = { updateCustomerSchema };
