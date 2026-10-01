const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const loaderOptions = {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true
};

function loadProto(name) {
  const protoDir = process.env.PROTO_DIR || '/app/contracts/proto';
  const definition = protoLoader.loadSync(path.join(protoDir, `${name}.proto`), loaderOptions);
  return grpc.loadPackageDefinition(definition);
}

module.exports = { loadProto, loaderOptions };

