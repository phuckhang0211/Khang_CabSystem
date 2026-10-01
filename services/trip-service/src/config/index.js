const required = ["TRIP_DATABASE_URL","TRIP_GRPC_ADDR","TRIP_GRPC_PORT","INTERNAL_SERVICE_TOKEN","RABBITMQ_URL","RABBITMQ_EXCHANGE"];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

module.exports = {
  serviceName: 'trip-service',
  databaseUrl: process.env.TRIP_DATABASE_URL,
  grpcAddress: process.env.TRIP_GRPC_ADDR,
  grpcPort: Number(process.env.TRIP_GRPC_PORT),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqExchange: process.env.RABBITMQ_EXCHANGE,
  logLevel: process.env.LOG_LEVEL || 'info'
};

