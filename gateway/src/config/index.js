const required = [
  'API_PREFIX',
  'GATEWAY_PORT',
  'GRPC_DEADLINE_MS',
  'INTERNAL_SERVICE_TOKEN',
  'AUTH_GRPC_ADDR',
  'CUSTOMER_GRPC_ADDR',
  'DRIVER_GRPC_ADDR',
  'BOOKING_GRPC_ADDR',
  'TRIP_GRPC_ADDR',
  'PAYMENT_GRPC_ADDR',
  'NOTIFY_GRPC_ADDR',
  'RATE_LIMIT_WINDOW_SECONDS'
];

for (const name of required) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

module.exports = {
  apiPrefix: process.env.API_PREFIX,
  port: Number(process.env.GATEWAY_PORT),
  grpcDeadlineMs: Number(process.env.GRPC_DEADLINE_MS),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS),
  grpcAddresses: {
    auth: process.env.AUTH_GRPC_ADDR,
    customer: process.env.CUSTOMER_GRPC_ADDR,
    driver: process.env.DRIVER_GRPC_ADDR,
    booking: process.env.BOOKING_GRPC_ADDR,
    trip: process.env.TRIP_GRPC_ADDR,
    payment: process.env.PAYMENT_GRPC_ADDR,
    notify: process.env.NOTIFY_GRPC_ADDR
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};
