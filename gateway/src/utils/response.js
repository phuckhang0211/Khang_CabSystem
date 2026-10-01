function sendData(res, data, status = 200) {
  return res.status(status).json({ data });
}

function sendPaginated(res, data, pagination, status = 200) {
  return res.status(status).json({ data, pagination });
}

function sendError(res, req, status, code, message, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) res.setHeader(name, value);
  }
  return res.status(status).json({
    error: {
      code,
      message,
      correlationId: req.correlationId
    }
  });
}

module.exports = { sendData, sendPaginated, sendError };
