const grpc = require('@grpc/grpc-js');
const { authenticatedUnary } = require('./grpcAuth');
const { makeError } = require('./errors');

function createUnimplementedHandlers(definition) {
  return Object.fromEntries(Object.keys(definition).map((method) => [method, authenticatedUnary((_call, callback) => {
    callback(makeError(grpc.status.UNIMPLEMENTED, 'UNIMPLEMENTED', 'RPC is not implemented'));
  })]));
}

module.exports = { createUnimplementedHandlers };

