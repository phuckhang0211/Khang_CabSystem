const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const config = require('../config');
const repo = require('../repositories/paymentRepo');
const { publish } = require('../events/rabbit');
const { makeError } = require('../utils/errors');
const { isUuid } = require('../utils/uuid');

const invalid = (code, message) => makeError(grpc.status.INVALID_ARGUMENT, code, message);
const conflict = () => makeError(grpc.status.ABORTED, 'STATE_CONFLICT', 'State conflict');
const notFound = () => makeError(grpc.status.NOT_FOUND, 'NOT_FOUND', 'Payment not found');

function validAmount(amount) { return Number.isSafeInteger(amount) && amount > 0; }
function response(row) { return { paymentId: row.id, paymentUrl: row.payment_url, status: row.status }; }
function payment(row) { return { paymentId: row.id, bookingId: row.booking_id, customerId: row.customer_id, amount: Number(row.amount), status: row.status, providerTxnId: row.provider_txn_id || '', paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : '' }; }
function verifySignature({ paymentId, providerTxnId, amount, result, signature }) {
  if (config.paymentSkipSignature) return true;
  const expected = crypto.createHmac('sha256', config.paymentCallbackSecret).update(`${paymentId}|${providerTxnId}|${amount}|${result}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function createPayment({ bookingId, customerId, amount }) {
  if (!isUuid(bookingId) || !isUuid(customerId) || !validAmount(amount)) throw invalid('VALIDATION_ERROR', 'Invalid payment input');
  const paymentId = crypto.randomUUID();
  const row = await repo.createOrFind({ id: paymentId, bookingId, customerId, amount, paymentUrl: `mock://pay/${paymentId}` });
  return response(row);
}

async function getPayment({ paymentId }, caller) {
  if (!isUuid(paymentId)) throw invalid('VALIDATION_ERROR', 'Invalid payment id');
  const row = await repo.findById(paymentId);
  if (!row) throw notFound();
  if (caller.userId && !((caller.role === 'CUSTOMER' && row.customer_id === caller.userId) || caller.role === 'ADMIN')) {
    throw makeError(grpc.status.PERMISSION_DENIED, 'FORBIDDEN', 'Access denied');
  }
  return payment(row);
}

async function handleCallback(input, correlationId) {
  const { paymentId, providerTxnId, amount, result, signature } = input;
  if (!isUuid(paymentId) || typeof providerTxnId !== 'string' || !providerTxnId || providerTxnId.length > 120 || !validAmount(amount) || !['SUCCESS', 'FAIL'].includes(result) || typeof signature !== 'string') throw invalid('VALIDATION_ERROR', 'Invalid callback input');
  if (!verifySignature(input)) throw invalid('INVALID_SIGNATURE', 'Invalid signature');
  let transaction;
  try {
    transaction = await repo.beginCallback(paymentId);
    if (!transaction.row) throw notFound();
    const row = transaction.row;
    if (row.status !== 'PENDING') {
      if (row.provider_txn_id === providerTxnId) { await repo.commit(transaction); transaction = null; return { paymentId: row.id, status: row.status, replayed: true }; }
      throw conflict();
    }
    if (BigInt(row.amount) !== BigInt(amount)) throw invalid('INVALID_AMOUNT', 'Invalid amount');
    if (await repo.transactionHasProviderTxn(transaction, providerTxnId)) throw makeError(grpc.status.ALREADY_EXISTS, 'ALREADY_EXISTS', 'Provider transaction already exists');
    transaction.providerTxnId = providerTxnId;
    const updated = await repo.updateCallback(transaction, result);
    if (!updated) {
      await repo.rollback(transaction); transaction = null;
      return handleCallback(input, correlationId);
    }
    await repo.commit(transaction); transaction = null;
    if (updated.status === 'COMPLETED') await publish('payment.completed', { paymentId: updated.id, bookingId: updated.booking_id, customerId: updated.customer_id, amount: Number(updated.amount), paidAt: new Date(updated.paid_at).toISOString() }, { correlationId, aggregateId: updated.id });
    else await publish('payment.failed', { paymentId: updated.id, bookingId: updated.booking_id, customerId: updated.customer_id, failureCode: updated.failure_code }, { correlationId, aggregateId: updated.id });
    return { paymentId: updated.id, status: updated.status, replayed: false };
  } catch (error) {
    if (transaction) await repo.rollback(transaction);
    if (error && error.code === '23505') throw makeError(grpc.status.ALREADY_EXISTS, 'ALREADY_EXISTS', 'Provider transaction already exists');
    throw error;
  }
}

module.exports = { createPayment, getPayment, handleCallback };
