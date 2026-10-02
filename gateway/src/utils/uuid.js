const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

module.exports = { isUuid };
