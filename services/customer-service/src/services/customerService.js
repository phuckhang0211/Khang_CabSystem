const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { escapeHtml } = require('../utils/escapeHtml');
const { makeError } = require('../utils/errors');
const customerRepo = require('../repositories/customerRepo');
const reviewRepo = require('../repositories/reviewRepo');
const tripClient = require('../clients/tripClient');
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

function toReview(row) {
  return { reviewId: row.id, tripId: row.trip_id, customerId: row.customer_id, driverId: row.driver_id, rating: Number(row.rating), comment: row.comment || '', createdAt: new Date(row.created_at).toISOString() };
}

async function createReview({ tripId, rating, comment }, caller) {
  if (caller.role !== 'CUSTOMER' || !isUuid(caller.userId)) throw makeError(grpc.status.PERMISSION_DENIED, 'FORBIDDEN', 'Forbidden');
  if (!isUuid(tripId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || (comment !== undefined && (typeof comment !== 'string' || comment.length > 500))) {
    throw makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Invalid review');
  }
  const safeComment = comment === undefined ? null : escapeHtml(comment);
  if (safeComment !== null && safeComment.length > 500) throw makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Invalid review comment');
  const trip = await tripClient.getTrip({ tripId }, caller);
  if (trip.customerId !== caller.userId) throw makeError(grpc.status.PERMISSION_DENIED, 'FORBIDDEN', 'Forbidden');
  if (trip.status !== 'COMPLETED') throw makeError(grpc.status.ABORTED, 'STATE_CONFLICT', 'Trip is not completed');
  try {
    const row = await reviewRepo.create({ id: crypto.randomUUID(), tripId, customerId: caller.userId, driverId: trip.driverId, rating, comment: safeComment });
    return toReview(row);
  } catch (error) {
    if (error.code === '23505') throw makeError(grpc.status.ALREADY_EXISTS, 'ALREADY_EXISTS', 'Review already exists');
    throw error;
  }
}

async function listReviews({ tripId, page, limit }) {
  if (!isUuid(tripId)) throw makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Invalid trip id');
  const currentPage = page || 1, currentLimit = limit || 10;
  if (!Number.isInteger(currentPage) || currentPage < 1 || !Number.isInteger(currentLimit) || currentLimit < 1 || currentLimit > 50) {
    throw makeError(grpc.status.INVALID_ARGUMENT, 'VALIDATION_ERROR', 'Invalid pagination');
  }
  const result = await reviewRepo.list(tripId, currentPage, currentLimit);
  return { items: result.rows.map(toReview), pageInfo: { page: currentPage, limit: currentLimit, total: result.total, totalPages: Math.ceil(result.total / currentLimit) } };
}

module.exports = { createCustomerProfile, getCustomer, updateCustomer, createReview, listReviews };
