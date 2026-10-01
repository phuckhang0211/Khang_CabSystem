const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const config = require('../config');

const loaderOptions = {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true
};

const definitions = {
  auth: ['auth', 'AuthService'],
  customer: ['customer', 'CustomerService'],
  driver: ['driver', 'DriverService'],
  booking: ['booking', 'BookingService'],
  trip: ['trip', 'TripService'],
  payment: ['payment', 'PaymentService'],
  notify: ['notify', 'NotifyService']
};

function loadService(serviceName, className) {
  const protoDir = process.env.PROTO_DIR || '/app/contracts/proto';
  const definition = protoLoader.loadSync(path.join(protoDir, `${serviceName}.proto`), loaderOptions);
  const loaded = grpc.loadPackageDefinition(definition);
  return loaded.cab[serviceName].v1[className];
}

function buildMetadata({ correlationId, userId, userRole } = {}) {
  const metadata = new grpc.Metadata();
  if (correlationId) metadata.set('x-correlation-id', correlationId);
  if (userId) metadata.set('x-user-id', String(userId));
  if (userRole) metadata.set('x-user-role', userRole);
  metadata.set('x-service-token', config.internalServiceToken);
  return metadata;
}

function invoke(client, method, request, metadataValues) {
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + config.grpcDeadlineMs);
    client[method](request, buildMetadata(metadataValues), { deadline }, (error, response) => {
      if (error) return reject(error);
      return resolve(response);
    });
  });
}

function createGrpcClients() {
  return Object.fromEntries(Object.entries(definitions).map(([serviceName, [protoName, className]]) => {
    const Service = loadService(protoName, className);
    const client = new Service(config.grpcAddresses[serviceName], grpc.credentials.createInsecure());
    return [serviceName, {
      client,
      call: (method, request, metadataValues) => invoke(client, method, request, metadataValues)
    }];
  }));
}

module.exports = { createGrpcClients, buildMetadata, invoke, loaderOptions };
