const grpc = require('@grpc/grpc-js'); const config = require('../config'); const { loadProto } = require('../utils/proto');
const auth = loadProto('auth'); const client = new auth.cab.auth.v1.AuthService(config.authGrpcAddr, grpc.credentials.createInsecure());
function call(method, request, correlationId) { const metadata = new grpc.Metadata(); metadata.set('x-service-token', config.internalServiceToken); if (correlationId) metadata.set('x-correlation-id', correlationId); return new Promise((resolve, reject) => client[method](request, metadata, { deadline: new Date(Date.now() + config.grpcDeadlineMs) }, (error, response) => error ? reject(error) : resolve(response))); }
function createDriverAccount(input, correlationId) { return call('createDriverAccount', input, correlationId); }
function setAccountStatus(input, correlationId) { return call('setAccountStatus', input, correlationId); }
module.exports = { createDriverAccount, setAccountStatus };
