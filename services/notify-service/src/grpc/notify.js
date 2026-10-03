const grpc = require('@grpc/grpc-js');
const { authenticatedUnary } = require('../utils/grpcAuth');
const { makeError } = require('../utils/errors');
const service = require('../services/notificationService');
function userId(call) { const value = call.metadata.get('x-user-id')[0]; if (!value) throw makeError(grpc.status.UNAUTHENTICATED, 'UNAUTHENTICATED', 'Authentication required'); return value; }
function createNotifyHandler(definition) { const fallback = Object.fromEntries(Object.keys(definition).map((key) => [key, authenticatedUnary((_call, callback) => callback(makeError(grpc.status.UNIMPLEMENTED, 'UNIMPLEMENTED', 'RPC is not implemented')))])); return { ...fallback, ListNotifications: authenticatedUnary((call, callback) => Promise.resolve(service.list(userId(call), call.request)).then((value) => callback(null, value)).catch((error) => callback(error))), MarkRead: authenticatedUnary((call, callback) => Promise.resolve(service.markRead(userId(call), call.request.notificationId)).then((value) => callback(null, value)).catch((error) => callback(error))), MarkAllRead: authenticatedUnary((call, callback) => Promise.resolve(service.markAll(userId(call))).then((value) => callback(null, value)).catch((error) => callback(error))) }; }
module.exports = { createNotifyHandler };
