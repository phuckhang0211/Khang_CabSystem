const express = require('express');

const port = Number(process.env.GATEWAY_PORT);
if (!port) {
  console.error('Missing required environment variable: GATEWAY_PORT');
  process.exit(1);
}

const app = express();
app.get('/health', (_req, res) => res.status(200).json({ status: 'healthy' }));
app.listen(port, () => console.log(JSON.stringify({
  ts: new Date().toISOString(),
  level: 'info',
  service: 'gateway',
  correlationId: null,
  msg: 'Gateway listening'
})));
