const crypto = require('crypto');
const config = require('../config');

function normalize(value, type) {
  const text = String(value).trim();
  const normalizedType = type || (text.includes('@') ? 'email' : (text.startsWith('+') || /^\d/.test(text) ? 'phone' : 'plate'));

  if (normalizedType === 'email') return text.toLowerCase();
  if (normalizedType === 'phone') return text.replace(/[\s-]/g, '');
  if (normalizedType === 'plate' || normalizedType === 'license') return text.toUpperCase().replace(/\s/g, '');
  throw new Error('Unsupported blind index type');
}

function blindIndex(value, type) {
  return crypto.createHmac('sha256', config.blindIndexKey).update(normalize(value, type), 'utf8').digest('hex');
}

module.exports = { blindIndex, normalize };
