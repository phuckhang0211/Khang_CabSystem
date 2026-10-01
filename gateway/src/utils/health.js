const net = require('net');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const Redis = require('ioredis');
const amqplib = require('amqplib');
const path = require('path');
const config = require('../config');

const serviceNames = ['auth', 'customer', 'driver', 'booking', 'trip', 'payment', 'notify'];

function loadHealthService() {
  const protoDir = process.env.PROTO_DIR || '/app/contracts/proto';
  const definition = protoLoader.loadSync(path.join(protoDir, 'health.proto'), {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true
  });
  return grpc.loadPackageDefinition(definition).grpc.health.v1.Health;
}

function checkGrpcHealth(address) {
  return new Promise((resolve, reject) => {
    const Health = loadHealthService();
    const client = new Health(address, grpc.credentials.createInsecure());
    const metadata = new grpc.Metadata();
    metadata.set('x-service-token', config.internalServiceToken);
    const deadline = new Date(Date.now() + config.grpcDeadlineMs);
    client.Check({ service: '' }, metadata, { deadline }, (error, response) => {
      client.close();
      if (error || response.status !== 'SERVING') return reject(error || new Error('Not serving'));
      return resolve();
    });
  });
}

function parseAddress(address) {
  const separator = address.lastIndexOf(':');
  return { host: address.slice(0, separator), port: Number(address.slice(separator + 1)) };
}

function checkTcp(address) {
  const { host, port } = parseAddress(address);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(config.grpcDeadlineMs);
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('TCP timeout'));
    });
    socket.once('error', reject);
  });
}

async function checkRedis() {
  const client = new Redis(config.redisUrl, { lazyConnect: true, connectTimeout: config.grpcDeadlineMs, maxRetriesPerRequest: null });
  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

async function checkRabbitMq() {
  const connection = await amqplib.connect(config.rabbitmqUrl, { timeout: config.grpcDeadlineMs });
  await connection.close();
}

async function timed(name, check) {
  const startedAt = Date.now();
  try {
    await check();
    return { name, status: 'healthy', latencyMs: Date.now() - startedAt };
  } catch (_) {
    return { name, status: 'unhealthy', latencyMs: Date.now() - startedAt };
  }
}

async function checkComponents() {
  const serviceChecks = serviceNames.map((name) => timed(`${name}-service`, () => checkGrpcHealth(config.grpcAddresses[name])));
  const databaseChecks = serviceNames.map((name) => timed(`${name}-db`, () => checkTcp(config.databaseAddresses[name])));
  const components = await Promise.all([
    ...serviceChecks,
    ...databaseChecks,
    timed('redis', checkRedis),
    timed('rabbitmq', checkRabbitMq)
  ]);
  return {
    status: components.every((component) => component.status === 'healthy') ? 'healthy' : 'unhealthy',
    components
  };
}

module.exports = { checkComponents };
