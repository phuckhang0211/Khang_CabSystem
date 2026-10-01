const required = ['AUTH_DATABASE_URL', 'AUTH_GRPC_ADDR', 'AUTH_GRPC_PORT', 'INTERNAL_SERVICE_TOKEN', 'REDIS_URL'];

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
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqExchange: process.env.RABBITMQ_EXCHANGE,
  logLevel: process.env.LOG_LEVEL || 'info'
};
