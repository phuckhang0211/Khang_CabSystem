const grpc = require('@grpc/grpc-js');
const config = require('./config');
const { loadProto } = require('./utils/proto');

const health = loadProto('health');
const client = new health.grpc.health.v1.Health(config.grpcAddress, grpc.credentials.createInsecure());
const metadata = new grpc.Metadata();
metadata.set('x-service-token', config.internalServiceToken);
client.Check({ service: '' }, metadata, (error, response) => {
  client.close();
  if (error || response.status !== 'SERVING') process.exit(1);
  process.exit(0);
});

