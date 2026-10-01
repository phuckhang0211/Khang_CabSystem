const { sendData, sendError } = require('../utils/response');
function createCustomerController(clients) {
  const metadata = (req) => ({ correlationId: req.correlationId, userId: req.user.id, userRole: req.user.role });
  async function get(req, res, next) {
    try { return sendData(res, await clients.customer.call('getCustomer', { userId: req.params.id }, metadata(req))); } catch (error) { return next(error); }
  }
  return {
    getMe: (req, res, next) => { req.params.id = req.user.id; return get(req, res, next); },
    updateMe: async (req, res, next) => { try { return sendData(res, await clients.customer.call('updateCustomer', req.body, metadata(req))); } catch (error) { return next(error); } },
    getById: (req, res, next) => (req.user.role === 'CUSTOMER' && req.params.id !== req.user.id ? sendError(res, req, 403, 'FORBIDDEN', 'Access denied') : get(req, res, next))
  };
}
module.exports = { createCustomerController };
