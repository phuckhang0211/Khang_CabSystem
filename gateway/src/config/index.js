const required = [
  'API_PREFIX',
  'GATEWAY_PORT',
  'GRPC_DEADLINE_MS',
  'INTERNAL_SERVICE_TOKEN',
  'JWT_SECRET',
  'AUTH_GRPC_ADDR',
  'CUSTOMER_GRPC_ADDR',
  'DRIVER_GRPC_ADDR',
  'BOOKING_GRPC_ADDR',
  'TRIP_GRPC_ADDR',
  'PAYMENT_GRPC_ADDR',
  'NOTIFY_GRPC_ADDR',
  'RATE_LIMIT_WINDOW_SECONDS',
  'AUTH_DB_ADDR',
  'CUSTOMER_DB_ADDR',
  'DRIVER_DB_ADDR',
  'BOOKING_DB_ADDR',
  'TRIP_DB_ADDR',
  'PAYMENT_DB_ADDR',
  'NOTIFY_DB_ADDR',
  'REDIS_URL',
  'RABBITMQ_URL'
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
  jwtSecret: process.env.JWT_SECRET,
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
  databaseAddresses: {
    auth: process.env.AUTH_DB_ADDR,
    customer: process.env.CUSTOMER_DB_ADDR,
    driver: process.env.DRIVER_DB_ADDR,
    booking: process.env.BOOKING_DB_ADDR,
    trip: process.env.TRIP_DB_ADDR,
    payment: process.env.PAYMENT_DB_ADDR,
    notify: process.env.NOTIFY_DB_ADDR
  },
  redisUrl: process.env.REDIS_URL,
  rabbitmqUrl: process.env.RABBITMQ_URL,
  logLevel: process.env.LOG_LEVEL || 'info'
};
