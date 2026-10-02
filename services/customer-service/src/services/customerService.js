const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { escapeHtml } = require('../utils/escapeHtml');
const { makeError } = require('../utils/errors');
const customerRepo = require('../repositories/customerRepo');
const { isUuid } = require('../utils/uuid');

function invalidArgument(message) { return makeError(grpc.status.INVALID_ARGUMENT, 'INVALID_ARGUMENT', message); }

function validateUserId(userId) {
  if (!isUuid(userId)) throw invalidArgument('Invalid user id');
}

function validateDisplayName(displayName) {
  if (typeof displayName !== 'string') throw invalidArgument('Invalid display name');
  const escaped = escapeHtml(displayName);
  if (escaped.length < 1 || escaped.length > 120) throw invalidArgument('Invalid display name');
  return escaped;
}

function toProfile(profile) {
  return { id: profile.id, userId: profile.user_id, displayName: profile.display_name, createdAt: new Date(profile.created_at).toISOString() };
}

async function createCustomerProfile({ userId, displayName }) {
  validateUserId(userId);
  const profile = await customerRepo.createOrFindProfile({ id: crypto.randomUUID(), userId, displayName: validateDisplayName(displayName) });
  return toProfile(profile);
}

async function getCustomer({ userId }, caller) {
  validateUserId(userId);
  if (caller.userId && ((caller.role === 'CUSTOMER' && caller.userId !== userId) || !['CUSTOMER', 'ADMIN'].includes(caller.role))) {
    throw makeError(grpc.status.PERMISSION_DENIED, 'FORBIDDEN', 'Forbidden');
  }
  const profile = await customerRepo.findByUserId(userId);
  if (!profile) throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'Customer not found');
  return toProfile(profile);
}

async function updateCustomer({ displayName }, caller) {
  if (caller.role !== 'CUSTOMER' || !caller.userId) throw makeError(grpc.status.PERMISSION_DENIED, 'FORBIDDEN', 'Forbidden');
  validateUserId(caller.userId);
  const profile = await customerRepo.updateDisplayName(caller.userId, validateDisplayName(displayName));
  if (!profile) throw makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'Customer not found');
  return toProfile(profile);
}

module.exports = { createCustomerProfile, getCustomer, updateCustomer };
