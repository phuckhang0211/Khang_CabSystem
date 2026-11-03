const { sendData, sendPaginated, sendError } = require('../utils/response');

function metadata(req) {
  return {
    correlationId: req.correlationId,
    userId: req.user && req.user.id,
    userRole: req.user && req.user.role
  };
}

function pageInfo(response) {
  return {
    page: response.pageInfo.page,
    limit: response.pageInfo.limit,
    total: response.pageInfo.total,
    totalPages: response.pageInfo.totalPages
  };
}

function safeDriver(driver) {
  return {
    driverId: driver.driverId,
    fullName: driver.fullName,
    workStatus: driver.workStatus,
    availability: driver.availability,
    vehicle: {
      plateNumber: driver.vehicle.plateNumber,
      vehicleType: driver.vehicle.vehicleType,
      brand: driver.vehicle.brand,
      model: driver.vehicle.model,
      color: driver.vehicle.color
    }
  };
}

function createDriverController(clients) {
  return {
    submitApplication: async (req, res, next) => {
      const normalizePhone = (value) => value.replace(/[\s-]/g, '');
      if (normalizePhone(req.body.phone) !== normalizePhone(req.onboarding.phone)) {
        return sendError(res, req, 400, 'VALIDATION_ERROR', 'Validation failed');
      }
      try {
        return sendData(res, await clients.driver.call('submitApplication', req.body, metadata(req)), 201);
      } catch (error) { return next(error); }
    },
    listApplications: async (req, res, next) => {
      try {
        const response = await clients.driver.call('listApplications', req.query, metadata(req));
        return sendPaginated(res, response.items, pageInfo(response));
      } catch (error) { return next(error); }
    },
    getApplication: async (req, res, next) => {
      try { return sendData(res, await clients.driver.call('getApplication', { applicationId: req.params.id }, metadata(req))); } catch (error) { return next(error); }
    },
    approveApplication: async (req, res, next) => {
      try { return sendData(res, await clients.driver.call('approveApplication', { applicationId: req.params.id }, metadata(req))); } catch (error) { return next(error); }
    },
    rejectApplication: async (req, res, next) => {
      try { return sendData(res, await clients.driver.call('rejectApplication', { applicationId: req.params.id, reason: req.body.reason }, metadata(req))); } catch (error) { return next(error); }
    },
    setWorkStatus: async (req, res, next) => {
      try { return sendData(res, await clients.driver.call('setWorkStatus', req.body, metadata(req))); } catch (error) { return next(error); }
    },
    updateLocation: async (req, res, next) => {
      try { return sendData(res, await clients.driver.call('updateLocation', req.body, metadata(req))); } catch (error) { return next(error); }
    },
    searchNearby: async (req, res, next) => {
      try {
        const response = await clients.driver.call('searchNearbyDrivers', req.query, metadata(req));
        const items = response.items.map((item) => ({ ...safeDriver(item.driver), distanceMeters: item.distanceMeters }));
        return sendPaginated(res, items, pageInfo(response));
      } catch (error) { return next(error); }
    },
    getDriver: async (req, res, next) => {
      try {
        const driver = await clients.driver.call('getDriver', { driverId: req.params.id }, metadata(req));
        return sendData(res, safeDriver(driver));
      } catch (error) { return next(error); }
    },
    getMe: async (req, res, next) => {
      try {
        const driver = await clients.driver.call('getDriver', { userId: req.user.id }, metadata(req));
        return sendData(res, safeDriver(driver));
      } catch (error) { return next(error); }
    }
  };
}

module.exports = { createDriverController };
