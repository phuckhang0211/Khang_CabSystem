const grpc = require('@grpc/grpc-js');
const config = require('../config');

const specialErrors = {
  IDEMPOTENCY_KEY_REUSED: { status: 422, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency key was reused' },
  OFFER_EXPIRED: { status: 410, code: 'OFFER_EXPIRED', message: 'Offer has expired' }
};

const statusErrors = {
  [grpc.status.INVALID_ARGUMENT]: { status: 400, fallbackCode: 'VALIDATION_ERROR', message: 'Validation failed' },
  [grpc.status.UNAUTHENTICATED]: { status: 401, fallbackCode: 'INVALID_TOKEN', message: 'Authentication failed' },
  [grpc.status.PERMISSION_DENIED]: { status: 403, fallbackCode: 'FORBIDDEN', message: 'Access denied' },
  [grpc.status.NOT_FOUND]: { status: 404, fallbackCode: 'NOT_FOUND', message: 'Resource not found' },
  [grpc.status.ALREADY_EXISTS]: { status: 409, fallbackCode: 'ALREADY_EXISTS', message: 'Resource already exists' },
  [grpc.status.ABORTED]: { status: 409, fallbackCode: 'STATE_CONFLICT', message: 'State conflict' },
  [grpc.status.RESOURCE_EXHAUSTED]: { status: 429, fallbackCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
  [grpc.status.UNAVAILABLE]: { status: 503, fallbackCode: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' },
  [grpc.status.DEADLINE_EXCEEDED]: { status: 503, fallbackCode: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' }
};

function trailerErrorCode(error) {
  const metadata = error && error.metadata;
  const values = metadata && typeof metadata.get === 'function' ? metadata.get('error-code') : [];
  return values && values[0] ? String(values[0]) : undefined;
}

function mapGrpcError(error) {
  const errorCode = trailerErrorCode(error);
  if (errorCode && specialErrors[errorCode]) return specialErrors[errorCode];
  if (error && error.details === 'Payment service unavailable') {
    return { status: 503, code: 'PAYMENT_SERVICE_UNAVAILABLE', message: 'Payment service unavailable' };
  }

  const mapped = statusErrors[error && error.code];
  if (!mapped) return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };

  const headers = mapped.status === 429
    ? { 'Retry-After': String(config.rateLimitWindowSeconds) }
    : undefined;
  return {
    status: mapped.status,
    code: errorCode || mapped.fallbackCode,
    message: mapped.message,
    headers
  };
}

module.exports = { mapGrpcError, trailerErrorCode };
