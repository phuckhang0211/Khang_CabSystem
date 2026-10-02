const required = ["DRIVER_DATABASE_URL","DRIVER_GRPC_ADDR","DRIVER_GRPC_PORT","AUTH_GRPC_ADDR","GRPC_DEADLINE_MS","INTERNAL_SERVICE_TOKEN","REDIS_URL","RABBITMQ_URL","RABBITMQ_EXCHANGE","ENCRYPTION_KEY_V1","ENCRYPTION_ACTIVE_KEY_ID","BLIND_INDEX_KEY"];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

module.exports = {
  serviceName: 'driver-service',
  databaseUrl: process.env.DRIVER_DATABASE_URL,
  grpcAddress: process.env.DRIVER_GRPC_ADDR,
  grpcPort: Number(process.env.DRIVER_GRPC_PORT),
  authGrpcAddr: process.env.AUTH_GRPC_ADDR,
  grpcDeadlineMs: Number(process.env.GRPC_DEADLINE_MS),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  redisUrl: process.env.REDIS_URL,
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqExchange: process.env.RABBITMQ_EXCHANGE,
  encryptionKeyV1: process.env.ENCRYPTION_KEY_V1,
  encryptionKeyV2: process.env.ENCRYPTION_KEY_V2,
  encryptionActiveKeyId: process.env.ENCRYPTION_ACTIVE_KEY_ID,
  blindIndexKey: process.env.BLIND_INDEX_KEY,
  logLevel: process.env.LOG_LEVEL || 'info'
};
