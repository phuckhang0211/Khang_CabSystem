const required = ["BOOKING_DATABASE_URL","BOOKING_GRPC_ADDR","BOOKING_GRPC_PORT","INTERNAL_SERVICE_TOKEN","RABBITMQ_URL","RABBITMQ_EXCHANGE"];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

module.exports = {
  serviceName: 'booking-service',
  databaseUrl: process.env.BOOKING_DATABASE_URL,
  grpcAddress: process.env.BOOKING_GRPC_ADDR,
  grpcPort: Number(process.env.BOOKING_GRPC_PORT),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  rabbitmqUrl: process.env.RABBITMQ_URL,
  rabbitmqExchange: process.env.RABBITMQ_EXCHANGE,
  logLevel: process.env.LOG_LEVEL || 'info'
};

