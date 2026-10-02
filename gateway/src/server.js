const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { correlationId } = require('./middlewares/correlationId');
const { sendError } = require('./utils/response');
const { mapGrpcError } = require('./utils/grpcError');
const { createGrpcClients } = require('./grpc-clients');
const { checkComponents } = require('./utils/health');
const { defaultRateLimit } = require('./middlewares/rateLimit');
const { createAuthRouter } = require('./routes/auth');
const { createCustomerRouter } = require('./routes/customers');
const { createDriverRouter, createAdminRouter } = require('./routes/drivers');

const app = express();
app.set('trust proxy', false);
const clients = createGrpcClients();
const apiRouter = express.Router();

app.use(correlationId);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(defaultRateLimit);

const healthPaths = ['/health', `${config.apiPrefix}/health`];
const readyPaths = ['/ready', `${config.apiPrefix}/ready`];
const servicesPaths = ['/health/services', `${config.apiPrefix}/health/services`];

app.get(healthPaths, (_req, res) => res.status(200).json({ status: 'healthy' }));
app.get(readyPaths, async (req, res) => {
  const result = await checkComponents();
  if (result.status === 'healthy') return res.status(200).json({ status: 'ready' });
  return sendError(res, req, 503, 'NOT_READY', 'Service dependencies are not ready');
});
app.get(servicesPaths, async (_req, res) => {
  const result = await checkComponents();
  return res.status(result.status === 'healthy' ? 200 : 503).json(result);
});
apiRouter.use('/auth', createAuthRouter(clients));
apiRouter.use('/customers', createCustomerRouter(clients));
apiRouter.use('/drivers', createDriverRouter(clients));
apiRouter.use('/admin', createAdminRouter(clients));
app.use(config.apiPrefix, apiRouter);

app.use((req, res) => sendError(res, req, 404, 'NOT_FOUND', 'Route not found'));

app.use((error, req, res, _next) => {
  if (error && error.type === 'entity.parse.failed') {
    return sendError(res, req, 400, 'VALIDATION_ERROR', 'Invalid JSON');
  }
  if (error && typeof error.code === 'number') {
    const mapped = mapGrpcError(error);
    return sendError(res, req, mapped.status, mapped.code, mapped.message, mapped.headers);
  }
  return sendError(res, req, 500, 'INTERNAL_ERROR', 'Internal server error');
});

app.listen(config.port, () => console.log(JSON.stringify({
  ts: new Date().toISOString(),
  level: 'info',
  service: 'gateway',
  correlationId: null,
  msg: 'Gateway listening'
})));

module.exports = { app, clients };
