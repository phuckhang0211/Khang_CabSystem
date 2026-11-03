const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { authenticateOnboarding } = require('../middlewares/onboardingAuth');
const { allow } = require('../middlewares/rbac');
const { validate } = require('../utils/validate');
const schemas = require('../schemas/driver');
const { createDriverController } = require('../controllers/driverController');

function createDriverRouter(clients) {
  const router = express.Router();
  const controller = createDriverController(clients);

  router.post('/applications', authenticateOnboarding, validate(schemas.submitApplicationSchema), controller.submitApplication);
  router.get('/me', authenticate, allow('DRIVER'), controller.getMe);
  router.put('/me/status', authenticate, allow('DRIVER'), validate(schemas.workStatusSchema), controller.setWorkStatus);
  router.put('/me/location', authenticate, allow('DRIVER'), validate(schemas.locationSchema), controller.updateLocation);
  router.get('/nearby', authenticate, validate(schemas.nearbyDriversSchema, 'query'), controller.searchNearby);
  router.get('/:id', authenticate, validate(schemas.driverIdParamsSchema, 'params'), controller.getDriver);
  return router;
}

function createAdminRouter(clients) {
  const router = express.Router();
  const controller = createDriverController(clients);

  router.get('/driver-applications', authenticate, allow('ADMIN'), validate(schemas.applicationListSchema, 'query'), controller.listApplications);
  router.get('/driver-applications/:id', authenticate, allow('ADMIN'), validate(schemas.applicationIdParamsSchema, 'params'), controller.getApplication);
  router.post('/driver-applications/:id/approve', authenticate, allow('ADMIN'), validate(schemas.applicationIdParamsSchema, 'params'), controller.approveApplication);
  router.post('/driver-applications/:id/reject', authenticate, allow('ADMIN'), validate(schemas.applicationIdParamsSchema, 'params'), validate(schemas.rejectApplicationSchema), controller.rejectApplication);
  return router;
}

module.exports = { createDriverRouter, createAdminRouter };
