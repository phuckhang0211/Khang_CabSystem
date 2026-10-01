const grpc = require('@grpc/grpc-js');
const { authenticatedUnary } = require('../utils/grpcAuth');
const authService = require('../services/authService');
const otpService = require('../services/otpService');

function unary(method) {
  return authenticatedUnary((call, callback) => {
    Promise.resolve(method(call.request)).then((response) => callback(null, response)).catch((error) => callback(error));
  });
}

function unimplemented(call, callback) {
  callback({ code: grpc.status.UNIMPLEMENTED, details: 'Not implemented' });
}

function createAuthHandler() {
  return {
    registerCustomer: authenticatedUnary(unimplemented),
    login: unary(authService.login),
    requestOtp: unary(otpService.requestOtp),
    verifyOtp: unary(otpService.verifyOtp),
    createDriverAccount: unary(authService.createDriverAccount),
    setAccountStatus: unary(authService.setAccountStatus),
    getUser: unary(authService.getUser)
  };
}

module.exports = { createAuthHandler };
