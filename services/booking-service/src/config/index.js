const required = ["BOOKING_DATABASE_URL","BOOKING_GRPC_ADDR","BOOKING_GRPC_PORT","PAYMENT_GRPC_ADDR","DRIVER_GRPC_ADDR","GRPC_DEADLINE_MS","PRICE_PER_KM","MATCH_RADIUS_KM","MATCH_MAX_OFFERS","OFFER_TTL_SECONDS","INTERNAL_SERVICE_TOKEN","RABBITMQ_URL","RABBITMQ_EXCHANGE"];

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
  paymentGrpcAddr: process.env.PAYMENT_GRPC_ADDR,
  driverGrpcAddr: process.env.DRIVER_GRPC_ADDR,
  grpcDeadlineMs: Number(process.env.GRPC_DEADLINE_MS),
  pricePerKm: Number(process.env.PRICE_PER_KM),
  matchRadiusKm: Number(process.env.MATCH_RADIUS_KM),
  matchMaxOffers: Number(process.env.MATCH_MAX_OFFERS),
  offerTtlSeconds: Number(process.env.OFFER_TTL_SECONDS),
  logLevel: process.env.LOG_LEVEL || 'info'
};
