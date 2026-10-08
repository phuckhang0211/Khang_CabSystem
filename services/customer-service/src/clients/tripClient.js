const grpc = require('@grpc/grpc-js');
const config = require('../config');
const { loadProto } = require('../utils/proto');

const api = loadProto('trip');
const client = new api.cab.trip.v1.TripService(config.tripGrpcAddr, grpc.credentials.createInsecure());

function getTrip({ tripId }, caller) {
  const metadata = new grpc.Metadata();
  metadata.set('x-service-token', config.internalServiceToken);
  if (caller.correlationId) metadata.set('x-correlation-id', caller.correlationId);
  if (caller.userId) metadata.set('x-user-id', caller.userId);
  if (caller.role) metadata.set('x-user-role', caller.role);
  return new Promise((resolve, reject) => client.getTrip(
    { tripId }, metadata, { deadline: new Date(Date.now() + config.grpcDeadlineMs) },
    (error, response) => error ? reject(error) : resolve(response)
  ));
}

module.exports = { getTrip };
