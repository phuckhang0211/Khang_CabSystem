const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { redis } = require('../db/redis');
const { blindIndex, normalize } = require('../utils/blindIndex');
const { makeError } = require('../utils/errors');

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
const INVALID_OTP_MESSAGE = 'Invalid OTP';

function validationError() {
  return makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Invalid OTP input');
}

function invalidOtpError() {
  return makeError(grpc.status.INVALID_ARGUMENT, 'INVALID_OTP', INVALID_OTP_MESSAGE);
}

function unavailableError() {
  return makeError(grpc.status.UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Service unavailable');
}

function normalizedPhone(phone) {
  if (typeof phone !== 'string') throw validationError();
  const value = normalize(phone, 'phone');
  if (!PHONE_PATTERN.test(value)) throw validationError();
  return value;
}

function otpHash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function requestOtp({ phone }) {
  const normalized = normalizedPhone(phone);
  const key = `otp:${blindIndex(normalized, 'phone')}`;
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  try {
    await redis.multi()
      .hset(key, 'otpHash', otpHash(otp), 'attempts', '0', 'purpose', 'DRIVER_ONBOARDING')
      .expire(key, config.otpTtlSeconds)
      .exec();
  } catch (error) {
    throw unavailableError();
  }
  return { ok: true, otp };
}

function hashMatches(storedHash, submittedOtp) {
  if (!/^[a-f0-9]{64}$/.test(storedHash || '')) return false;
  const stored = Buffer.from(storedHash, 'hex');
  const submitted = Buffer.from(otpHash(submittedOtp), 'hex');
  return stored.length === submitted.length && crypto.timingSafeEqual(stored, submitted);
}

async function verifyOtp({ phone, otp }) {
  const normalized = normalizedPhone(phone);
  if (typeof otp !== 'string' || otp.length === 0 || otp.length > 10) throw validationError();
  const key = `otp:${blindIndex(normalized, 'phone')}`;

  try {
    const values = await redis.hgetall(key);
    if (!values || !values.otpHash || !hashMatches(values.otpHash, otp)) {
      if (values && values.otpHash) {
        const attempts = await redis.hincrby(key, 'attempts', 1);
        if (attempts >= config.otpMaxAttempts) await redis.del(key);
      }
      throw invalidOtpError();
    }

    const deleted = await redis.del(key);
    if (deleted !== 1) throw invalidOtpError();
  } catch (error) {
    if (Number.isInteger(error.code) && error.code >= grpc.status.OK && error.code <= grpc.status.UNAUTHENTICATED) {
      throw error;
    }
    throw unavailableError();
  }

  const onboardingToken = jwt.sign(
    { purpose: 'DRIVER_ONBOARDING', phone: normalized },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.onboardingTokenExpiresInSeconds }
  );
  return { onboardingToken };
}

module.exports = { requestOtp, verifyOtp };
