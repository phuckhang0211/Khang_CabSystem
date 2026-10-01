const grpc = require('@grpc/grpc-js');
const config = require('../config');
const { loadProto } = require('../utils/proto');

const customer = loadProto('customer');
const client = new customer.cab.customer.v1.CustomerService(
  config.customerGrpcAddr,
  grpc.credentials.createInsecure()
);

function createCustomerProfile({ userId, displayName, correlationId }) {
  const metadata = new grpc.Metadata();
  metadata.set('x-service-token', config.internalServiceToken);
  if (correlationId) metadata.set('x-correlation-id', correlationId);

  return new Promise((resolve, reject) => {
    client.createCustomerProfile(
      { userId, displayName },
      metadata,
      { deadline: new Date(Date.now() + config.grpcDeadlineMs) },
      (error, response) => (error ? reject(error) : resolve(response))
    );
  });
}

module.exports = { createCustomerProfile };
