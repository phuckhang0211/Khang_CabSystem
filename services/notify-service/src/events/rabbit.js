const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

let connection;
let channel;

async function connectRabbit() {
  const amqplib = require('amqplib');
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      connection = await amqplib.connect(config.rabbitmqUrl);
      channel = await connection.createChannel();
      connection.on('error', () => logger.warn('RabbitMQ connection error'));
      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        connection = undefined;
        channel = undefined;
      });
      channel.on('error', () => logger.warn('RabbitMQ channel error'));
      channel.on('close', () => {
        logger.warn('RabbitMQ channel closed');
        channel = undefined;
      });
      await channel.assertExchange(config.rabbitmqExchange, 'topic', { durable: true });
      return channel;
    } catch (error) {
      lastError = error;
      logger.warn(`RabbitMQ connection attempt ${attempt} failed`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

async function publish(routingKey, payload, correlationId) {
  const activeChannel = channel || await connectRabbit();
  const envelope = {
    eventId: crypto.randomUUID(),
    eventType: routingKey,
    occurredAt: new Date().toISOString(),
    correlationId,
    data: payload
  };
  try {
    activeChannel.publish(config.rabbitmqExchange, routingKey, Buffer.from(JSON.stringify(envelope)), { persistent: true });
  } catch (error) {
    logger.error('RabbitMQ publish failed', correlationId);
  }
}

async function consume(queue, bindings, handler) {
  const activeChannel = channel || await connectRabbit();
  await activeChannel.assertQueue(queue, { durable: true });
  for (const routingKey of bindings) await activeChannel.bindQueue(queue, config.rabbitmqExchange, routingKey);
  await activeChannel.prefetch(10);
  await activeChannel.consume(queue, async (message) => {
    if (!message) return;
    try {
      await handler(JSON.parse(message.content.toString()));
      activeChannel.ack(message);
    } catch (error) {
      logger.error('RabbitMQ consumer failed');
      activeChannel.nack(message, false, false);
    }
  }, { noAck: false });
}

async function closeRabbit() {
  if (connection) await connection.close();
}

module.exports = { connectRabbit, publish, consume, closeRabbit };
