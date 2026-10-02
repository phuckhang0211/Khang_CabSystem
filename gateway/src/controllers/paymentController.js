const { sendData } = require('../utils/response');

function metadata(req) { return { correlationId: req.correlationId, userId: req.user && req.user.id, userRole: req.user && req.user.role }; }
function createPaymentController(clients) {
  return {
    callback: async (req, res, next) => { try { return sendData(res, await clients.payment.call('handleCallback', req.body, metadata(req))); } catch (error) { return next(error); } },
    getPayment: async (req, res, next) => { try { return sendData(res, await clients.payment.call('getPayment', { paymentId: req.params.id }, metadata(req))); } catch (error) { return next(error); } }
  };
}
module.exports = { createPaymentController };
