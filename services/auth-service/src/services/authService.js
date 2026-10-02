const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { encrypt } = require('../utils/crypto');
const { blindIndex, normalize } = require('../utils/blindIndex');
const { escapeHtml } = require('../utils/escapeHtml');
const { makeError } = require('../utils/errors');
const { isUuid } = require('../utils/uuid');
const userRepo = require('../repositories/userRepo');
const customerClient = require('../clients/customerClient');
const logger = require('../utils/logger');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 72;
}

function validateEmail(email) {
  return typeof email === 'string' && email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return typeof phone === 'string' && /^\+?[0-9]{8,15}$/.test(normalize(phone, 'phone'));
}

function invalidArgument(message) {
  return makeError(grpc.status.INVALID_ARGUMENT, 'INVALID_ARGUMENT', message);
}

function validateUserId(userId) {
  if (!isUuid(userId)) throw invalidArgument('Invalid user id');
}

function validationError(message) {
  return makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', message);
}

function validateCustomerInput({ email, password, displayName, phone, _phone }) {
  const normalizedEmail = typeof email === 'string' ? normalize(email, 'email') : '';
  const escapedDisplayName = typeof displayName === 'string' ? escapeHtml(displayName) : '';
  const hasPhone = _phone === 'phone' || (typeof phone === 'string' && phone.length > 0);
  const normalizedPhone = hasPhone && typeof phone === 'string' ? normalize(phone, 'phone') : null;

  if (!validateEmail(normalizedEmail) || !validatePassword(password)
    || escapedDisplayName.length < 1 || escapedDisplayName.length > 120
    || (hasPhone && !validatePhone(normalizedPhone))) {
    throw validationError('Invalid customer registration input');
  }
  return { normalizedEmail, normalizedPhone, escapedDisplayName };
}

async function login({ identifier, password }) {
  if (typeof identifier !== 'string' || typeof password !== 'string') {
    throw makeError(grpc.status.UNAUTHENTICATED, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }
  const user = identifier.includes('@')
    ? await userRepo.findByEmailBlindIndex(blindIndex(identifier, 'email'))
    : await userRepo.findByPhoneBlindIndex(blindIndex(identifier, 'phone'));
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordMatches) {
    throw makeError(grpc.status.UNAUTHENTICATED, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }
  if (user.status !== 'ACTIVE') {
    throw makeError(grpc.status.PERMISSION_DENIED, 'ACCOUNT_NOT_ACTIVE', 'Account is not active');
  }
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role }, config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.jwtExpiresInSeconds }
  );
  return { accessToken, tokenType: 'Bearer', expiresIn: config.jwtExpiresInSeconds };
}

async function registerCustomer(request, correlationId) {
  const { normalizedEmail, normalizedPhone, escapedDisplayName } = validateCustomerInput(request);
  if (await userRepo.findByEmailBlindIndex(blindIndex(normalizedEmail, 'email'))
    || (normalizedPhone && await userRepo.findByPhoneBlindIndex(blindIndex(normalizedPhone, 'phone')))) {
    throw makeError(grpc.status.ALREADY_EXISTS, 'ALREADY_EXISTS', 'Customer already exists');
  }

  let user;
  try {
    user = await userRepo.createUser({
      id: crypto.randomUUID(),
      emailEnc: encrypt(normalizedEmail),
      emailBidx: blindIndex(normalizedEmail, 'email'),
      phoneEnc: normalizedPhone ? encrypt(normalizedPhone) : null,
      phoneBidx: normalizedPhone ? blindIndex(normalizedPhone, 'phone') : null,
      passwordHash: await bcrypt.hash(request.password, config.bcryptCost),
      role: 'CUSTOMER',
      status: 'PENDING'
    });
  } catch (error) {
    if (error.code === '23505') throw makeError(grpc.status.ALREADY_EXISTS, 'ALREADY_EXISTS', 'Customer already exists');
    throw error;
  }

  try {
    await customerClient.createCustomerProfile({
      userId: user.id,
      displayName: request.displayName,
      correlationId
    });
  } catch (_error) {
    try {
      await userRepo.deleteById(user.id);
    } catch (_deleteError) {
      logger.warn('Failed to roll back customer registration');
    }
    throw makeError(grpc.status.UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Customer service unavailable');
  }
  const activeUser = await userRepo.setAccountStatus(user.id, 'ACTIVE');
  return { userId: activeUser.id, status: activeUser.status };
}

async function createDriverAccount({ email, password, phone }) {
  if (!validateEmail(email) || !validatePassword(password) || !validatePhone(phone)) {
    throw invalidArgument('Invalid driver account input');
  }
  const normalizedEmail = normalize(email, 'email');
  const normalizedPhone = normalize(phone, 'phone');
  try {
    const user = await userRepo.createUser({
      id: crypto.randomUUID(), emailEnc: encrypt(normalizedEmail), emailBidx: blindIndex(normalizedEmail, 'email'),
      phoneEnc: encrypt(normalizedPhone), phoneBidx: blindIndex(normalizedPhone, 'phone'),
      passwordHash: await bcrypt.hash(password, config.bcryptCost), role: 'DRIVER', status: 'PENDING'
    });
    return { userId: user.id, status: user.status };
  } catch (error) {
    if (error.code === '23505') {
      throw makeError(grpc.status.ALREADY_EXISTS, 'ALREADY_EXISTS', 'Email or phone already exists');
    }
    throw error;
  }
}

async function setAccountStatus({ userId, status }) {
  validateUserId(userId);
  if (!['ACTIVE', 'REJECTED'].includes(status)) throw invalidArgument('Status must be ACTIVE or REJECTED');
  const user = await userRepo.setAccountStatus(userId, status);
  if (!user) throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'User not found');
  return { userId: user.id, status: user.status };
}

async function getUser({ userId }) {
  validateUserId(userId);
  const user = await userRepo.findById(userId);
  if (!user) throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'User not found');
  return { userId: user.id, role: user.role, status: user.status };
}

module.exports = { registerCustomer, login, createDriverAccount, setAccountStatus, getUser };
