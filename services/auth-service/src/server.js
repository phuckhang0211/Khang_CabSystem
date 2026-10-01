const grpc = require('@grpc/grpc-js');
const config = require('./config');
const logger = require('./utils/logger');
const { loadProto } = require('./utils/proto');
const { waitForPostgres, runMigrations, closePostgres } = require('./db/pg');
const { waitForRedis, closeRedis } = require('./db/redis');
const { createHealthHandler } = require('./grpc/health');
const { createAuthHandler } = require('./grpc/auth');

const server = new grpc.Server();
let shuttingDown = false;

async function start() {
  await waitForPostgres();
  await waitForRedis();
  await runMigrations();

  const health = loadProto('health');
  const auth = loadProto('auth');
  server.addService(health.grpc.health.v1.Health.service, createHealthHandler());
  server.addService(auth.cab.auth.v1.AuthService.service, createAuthHandler());
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
    await Promise.all([closePostgres(), closeRedis()]);
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
start().catch((error) => {
  logger.error('Service startup failed');
  process.exit(1);
});
