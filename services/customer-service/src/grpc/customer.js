const grpc = require('@grpc/grpc-js');
const { authenticatedUnary } = require('../utils/grpcAuth');
const { makeError } = require('../utils/errors');
const customerService = require('../services/customerService');

function callerFromMetadata(call) {
  return { userId: call.metadata.get('x-user-id')[0], role: call.metadata.get('x-user-role')[0] };
}

function unary(method) {
  return authenticatedUnary((call, callback) => {
    Promise.resolve(method(call.request, callerFromMetadata(call))).then((response) => callback(null, response)).catch((error) => callback(error));
  });
}

function unimplemented(call, callback) {
  callback(makeError(grpc.status.UNIMPLEMENTED, 'UNIMPLEMENTED', 'RPC is not implemented'));
}

function createCustomerHandler() {
  return {
    createCustomerProfile: unary(customerService.createCustomerProfile),
    getCustomer: unary(customerService.getCustomer),
    updateCustomer: unary(customerService.updateCustomer),
    createReview: authenticatedUnary(unimplemented),
    listReviews: authenticatedUnary(unimplemented)
  };
}

module.exports = { createCustomerHandler };
