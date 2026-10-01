const { sendData } = require('../utils/response');
function createAuthController(clients) {
  function publicCall(method, status = 200) {
    return async (req, res, next) => {
      try { return sendData(res, await clients.auth.call(method, req.body, { correlationId: req.correlationId }), status); } catch (error) { return next(error); }
    };
  }
  return { register: publicCall('registerCustomer', 201), login: publicCall('login'), requestOtp: publicCall('requestOtp'), verifyOtp: publicCall('verifyOtp') };
}
module.exports = { createAuthController };
