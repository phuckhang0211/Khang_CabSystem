const grpc = require('@grpc/grpc-js');
const config = require('../config');
const { loadProto } = require('../utils/proto');

const proto = loadProto('driver');
const client = new proto.cab.driver.v1.DriverService(config.driverGrpcAddr, grpc.credentials.createInsecure());

function call(method, request, correlationId) {
  const metadata = new grpc.Metadata();
  metadata.set('x-service-token', config.internalServiceToken);
  if (correlationId) metadata.set('x-correlation-id', correlationId);
  return new Promise((resolve, reject) => client[method](request, metadata, {
    deadline: new Date(Date.now() + config.grpcDeadlineMs)
  }, (error, response) => error ? reject(error) : resolve(response)));
}
function searchNearbyDrivers(request, correlationId) { return call('searchNearbyDrivers', request, correlationId); }
function getDriver(request, correlationId) { return call('getDriver', request, correlationId); }
function tryAssignDriver(request, correlationId) { return call('tryAssignDriver', request, correlationId); }
function releaseDriver(request, correlationId) { return call('releaseDriver', request, correlationId); }
module.exports = { searchNearbyDrivers, getDriver, tryAssignDriver, releaseDriver };
