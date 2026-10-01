const grpc = require('@grpc/grpc-js');

function makeError(grpcCode, errorCode, message) {
  const error = new Error(message);
  error.code = grpcCode;
  error.metadata = new grpc.Metadata();
  error.metadata.set('error-code', errorCode);
  return error;
}

module.exports = { makeError };

