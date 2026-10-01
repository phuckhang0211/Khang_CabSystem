const grpc = require('@grpc/grpc-js');
const config = require('./config');
const logger = require('./utils/logger');
const { loadProto } = require('./utils/proto');
const { waitForPostgres, runMigrations, closePostgres } = require('./db/pg');
const { createHealthHandler } = require('./grpc/health');
const { createCustomerHandler } = require('./grpc/customer');

const server = new grpc.Server();
let shuttingDown = false;

async function start() {
  await waitForPostgres();
  await runMigrations();

  const health = loadProto('health');
  const api = loadProto('customer');
  server.addService(health.grpc.health.v1.Health.service, createHealthHandler());
  server.addService(api.cab.customer.v1.CustomerService.service, createCustomerHandler());
  server.bindAsync(`0.0.0.0:${config.grpcPort}`, grpc.ServerCredentials.createInsecure(), (error) => {
    if (error) throw error;
    logger.info('gRPC server listening');
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down');
  server.tryShutdown(async () => {
    await Promise.all([closePostgres()]);
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
start().catch(() => {
  logger.error('Service startup failed');
  process.exit(1);
});
