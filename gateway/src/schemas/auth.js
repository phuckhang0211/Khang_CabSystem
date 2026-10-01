const { z } = require('zod');
const registerSchema = z.object({ email: z.string(), password: z.string(), displayName: z.string(), phone: z.string().optional() });
const loginSchema = z.object({ identifier: z.string(), password: z.string() });
const otpRequestSchema = z.object({ phone: z.string() });
const otpVerifySchema = z.object({ phone: z.string(), otp: z.string() });
module.exports = { registerSchema, loginSchema, otpRequestSchema, otpVerifySchema };
