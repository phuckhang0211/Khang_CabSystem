const grpc = require('@grpc/grpc-js');
const { authenticatedUnary } = require('../utils/grpcAuth');
const { makeError } = require('../utils/errors');
const service = require('../services/paymentService');

function caller(call) { return { userId: call.metadata.get('x-user-id')[0], role: call.metadata.get('x-user-role')[0], correlationId: call.metadata.get('x-correlation-id')[0] }; }
function createPaymentHandler(definition) {
  const fallback = Object.fromEntries(Object.keys(definition).map((key) => [key, authenticatedUnary((_call, callback) => callback(makeError(grpc.status.UNIMPLEMENTED, 'UNIMPLEMENTED', 'RPC is not implemented')))]));
  return {
    ...fallback,
    CreatePayment: authenticatedUnary((call, callback) => Promise.resolve(service.createPayment(call.request)).then((value) => callback(null, value)).catch((error) => callback(error))),
    GetPayment: authenticatedUnary((call, callback) => Promise.resolve(service.getPayment(call.request, caller(call))).then((value) => callback(null, value)).catch((error) => callback(error))),
    HandleCallback: authenticatedUnary((call, callback) => Promise.resolve(service.handleCallback(call.request, caller(call).correlationId)).then((value) => callback(null, value)).catch((error) => callback(error)))
  };
}
module.exports = { createPaymentHandler };
