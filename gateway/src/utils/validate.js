const { z } = require('zod');
const { sendError } = require('./response');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return sendError(res, req, 400, 'VALIDATION_ERROR', 'Validation failed');
    }
    req[source] = parsed.data;
    return next();
  };
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

function parsePagination(query) {
  const parsed = paginationSchema.safeParse(query);
  if (!parsed.success) {
    const error = new Error('Validation failed');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return parsed.data;
}

module.exports = { validate, parsePagination, paginationSchema };
