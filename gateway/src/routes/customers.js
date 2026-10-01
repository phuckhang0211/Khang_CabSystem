const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { allow } = require('../middlewares/rbac');
const { validate } = require('../utils/validate');
const { updateCustomerSchema } = require('../schemas/customer');
const { createCustomerController } = require('../controllers/customerController');

function createCustomerRouter(clients) {
  const controller = createCustomerController(clients);
  const router = express.Router();
  router.get('/me', authenticate, allow('CUSTOMER'), controller.getMe);
  router.patch('/me', authenticate, allow('CUSTOMER'), validate(updateCustomerSchema), controller.updateMe);
  router.get('/:id', authenticate, allow('CUSTOMER', 'ADMIN'), controller.getById);
  return router;
}

module.exports = { createCustomerRouter };
