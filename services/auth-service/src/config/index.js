const required = [
  'AUTH_DATABASE_URL',
  'AUTH_GRPC_ADDR',
  'AUTH_GRPC_PORT',
  'INTERNAL_SERVICE_TOKEN',
  'REDIS_URL',
  'ENCRYPTION_KEY_V1',
  'ENCRYPTION_ACTIVE_KEY_ID',
  'BLIND_INDEX_KEY'
];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

module.exports = {
  serviceName: 'auth-service',
  databaseUrl: process.env.AUTH_DATABASE_URL,
  grpcAddress: process.env.AUTH_GRPC_ADDR,
  grpcPort: Number(process.env.AUTH_GRPC_PORT),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  redisUrl: process.env.REDIS_URL,
  encryptionKeyV1: process.env.ENCRYPTION_KEY_V1,
  encryptionKeyV2: process.env.ENCRYPTION_KEY_V2,
  encryptionActiveKeyId: process.env.ENCRYPTION_ACTIVE_KEY_ID,
  blindIndexKey: process.env.BLIND_INDEX_KEY,
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqExchange: process.env.RABBITMQ_EXCHANGE,
  logLevel: process.env.LOG_LEVEL || 'info'
};
