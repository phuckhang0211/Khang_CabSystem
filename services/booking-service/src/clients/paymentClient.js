const grpc = require("@grpc/grpc-js");
const config = require("../config");
const { loadProto } = require("../utils/proto");
const proto = loadProto("payment");
const client = new proto.cab.payment.v1.PaymentService(
  config.paymentGrpcAddr,
  grpc.credentials.createInsecure(),
);
function call(method, request, correlationId) {
  const m = new grpc.Metadata();
  m.set("x-service-token", config.internalServiceToken);
  if (correlationId) m.set("x-correlation-id", correlationId);
  return new Promise((resolve, reject) =>
    client[method](
      request,
      m,
      { deadline: new Date(Date.now() + config.grpcDeadlineMs) },
      (e, r) => (e ? reject(e) : resolve(r)),
    ),
  );
}
function createPayment(request, correlationId) {
  return call("createPayment", request, correlationId);
}
function getPayment(request, correlationId) {
  return call("getPayment", request, correlationId);
}
module.exports = { createPayment, getPayment };
