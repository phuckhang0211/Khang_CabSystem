const grpc = require('@grpc/grpc-js');
const config = require('../config');
const { loadProto } = require('../utils/proto');

const proto = loadProto('driver');
const client = new proto.cab.driver.v1.DriverService(config.driverGrpcAddr, grpc.credentials.createInsecure());

function searchNearbyDrivers(request, correlationId) {
  const metadata = new grpc.Metadata();
  metadata.set('x-service-token', config.internalServiceToken);
  if (correlationId) metadata.set('x-correlation-id', correlationId);
  return new Promise((resolve, reject) => client.searchNearbyDrivers(request, metadata, {
    deadline: new Date(Date.now() + config.grpcDeadlineMs)
  }, (error, response) => error ? reject(error) : resolve(response)));
}

module.exports = { searchNearbyDrivers };
