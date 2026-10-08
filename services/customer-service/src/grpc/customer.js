const { authenticatedUnary } = require('../utils/grpcAuth');
const customerService = require('../services/customerService');

function callerFromMetadata(call) {
  return { userId: call.metadata.get('x-user-id')[0], role: call.metadata.get('x-user-role')[0], correlationId: call.metadata.get('x-correlation-id')[0] };
}

function unary(method) {
  return authenticatedUnary((call, callback) => {
    Promise.resolve(method(call.request, callerFromMetadata(call))).then((response) => callback(null, response)).catch((error) => callback(error));
  });
}

function createCustomerHandler() {
  return {
    createCustomerProfile: unary(customerService.createCustomerProfile),
    getCustomer: unary(customerService.getCustomer),
    updateCustomer: unary(customerService.updateCustomer),
    createReview: unary(customerService.createReview),
    listReviews: unary(customerService.listReviews)
  };
}

module.exports = { createCustomerHandler };
