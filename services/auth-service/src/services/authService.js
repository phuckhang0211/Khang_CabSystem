const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { encrypt } = require('../utils/crypto');
const { blindIndex, normalize } = require('../utils/blindIndex');
const { makeError } = require('../utils/errors');
const userRepo = require('../repositories/userRepo');

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
  if (!['ACTIVE', 'REJECTED'].includes(status)) throw invalidArgument('Status must be ACTIVE or REJECTED');
  const user = await userRepo.setAccountStatus(userId, status);
  if (!user) throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'User not found');
  return { userId: user.id, status: user.status };
}

async function getUser({ userId }) {
  const user = await userRepo.findById(userId);
  if (!user) throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'User not found');
  return { userId: user.id, role: user.role, status: user.status };
}

module.exports = { login, createDriverAccount, setAccountStatus, getUser };
