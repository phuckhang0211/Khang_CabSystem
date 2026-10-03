const grpc = require('@grpc/grpc-js');
const config = require('./config');
const logger = require('./utils/logger');
const { loadProto } = require('./utils/proto');
const { waitForPostgres, runMigrations, closePostgres } = require('./db/pg');
const { connectRabbit, closeRabbit } = require('./events/rabbit');
const { createHealthHandler } = require('./grpc/health');
const { createTripHandler } = require('./grpc/trip');
const { consume } = require('./events/rabbit');
const trips = require('./services/tripService');

const server = new grpc.Server();
let shuttingDown = false;

async function start() {
  await waitForPostgres();
  await connectRabbit();
  await runMigrations();

  const health = loadProto('health');
  const api = loadProto('trip');
  server.addService(health.grpc.health.v1.Health.service, createHealthHandler());
  server.addService(api.cab.trip.v1.TripService.service, createTripHandler(api.cab.trip.v1.TripService.service));
  server.bindAsync(`0.0.0.0:${config.grpcPort}`, grpc.ServerCredentials.createInsecure(), (error) => {
    if (error) throw error;
    logger.info('gRPC server listening');
  });
  await consume('trip.q', ['booking.assigned'], trips.consume);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down');
  server.tryShutdown(async () => {
    await Promise.all([closePostgres(), closeRabbit()]);
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
start().catch(() => {
  logger.error('Service startup failed');
  process.exit(1);
});
