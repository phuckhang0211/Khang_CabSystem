const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { allow } = require('../middlewares/rbac');
const { validate } = require('../utils/validate');
const schemas = require('../schemas/review');
const { createReviewController } = require('../controllers/reviewController');

function createReviewRouter(clients) {
  const router = express.Router();
  const controller = createReviewController(clients);
  router.post('/', authenticate, allow('CUSTOMER'), validate(schemas.create), controller.create);
  router.get('/', authenticate, validate(schemas.list, 'query'), controller.list);
  return router;
}

module.exports = { createReviewRouter };
