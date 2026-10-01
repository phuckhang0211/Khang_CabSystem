const grpc = require('@grpc/grpc-js');
const config = require('../config');
const { makeError } = require('./errors');

function requireServiceToken(call) {
  const token = call.metadata.get('x-service-token')[0];
  if (token !== config.internalServiceToken) {
    throw makeError(grpc.status.UNAUTHENTICATED, 'UNAUTHENTICATED', 'Invalid service token');
  }
}

function authenticatedUnary(handler) {
  return (call, callback) => {
    try {
      requireServiceToken(call);
      handler(call, callback);
    } catch (error) {
      callback(error);
    }
  };
}

module.exports = { requireServiceToken, authenticatedUnary };
