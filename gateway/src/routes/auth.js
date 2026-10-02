const express = require('express');
const { validate } = require('../utils/validate');
const { registerSchema, loginSchema, otpRequestSchema, otpVerifySchema } = require('../schemas/auth');
const { createAuthController } = require('../controllers/authController');
const { loginLimiter } = require('../middlewares/rateLimit');

function createAuthRouter(clients) {
  const controller = createAuthController(clients);
  const router = express.Router();
  router.post('/register', validate(registerSchema), controller.register);
  router.post('/login', loginLimiter, validate(loginSchema), controller.login);
  router.post('/otp/request', validate(otpRequestSchema), controller.requestOtp);
  router.post('/otp/verify', validate(otpVerifySchema), controller.verifyOtp);
  return router;
}

module.exports = { createAuthRouter };
