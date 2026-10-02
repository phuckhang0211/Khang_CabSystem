const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { allow } = require('../middlewares/rbac');
const { validate } = require('../utils/validate');
const { paymentIdParamsSchema, callbackSchema } = require('../schemas/payment');
const { createPaymentController } = require('../controllers/paymentController');

function createPaymentRouter(clients) {
  const router = express.Router();
  const controller = createPaymentController(clients);
  router.post('/mock/callback', validate(callbackSchema), controller.callback);
  router.get('/:id', authenticate, allow('CUSTOMER', 'ADMIN'), validate(paymentIdParamsSchema, 'params'), controller.getPayment);
  return router;
}
module.exports = { createPaymentRouter };
