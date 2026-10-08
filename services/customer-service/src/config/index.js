const required = ["CUSTOMER_DATABASE_URL","CUSTOMER_GRPC_ADDR","CUSTOMER_GRPC_PORT","TRIP_GRPC_ADDR","GRPC_DEADLINE_MS","INTERNAL_SERVICE_TOKEN"];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

module.exports = {
  serviceName: 'customer-service',
  databaseUrl: process.env.CUSTOMER_DATABASE_URL,
  grpcAddress: process.env.CUSTOMER_GRPC_ADDR,
  grpcPort: Number(process.env.CUSTOMER_GRPC_PORT),
  tripGrpcAddr: process.env.TRIP_GRPC_ADDR,
  grpcDeadlineMs: Number(process.env.GRPC_DEADLINE_MS),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  logLevel: process.env.LOG_LEVEL || 'info'
};
