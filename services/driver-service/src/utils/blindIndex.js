const crypto = require('crypto'); const config = require('../config');
function normalize(value, type) { const text = String(value).trim(); if (type === 'email') return text.toLowerCase(); if (type === 'phone') return text.replace(/[\s-]/g, ''); if (type === 'plate' || type === 'license') return text.toUpperCase().replace(/\s/g, ''); throw new Error('Unsupported blind index type'); }
function blindIndex(value, type) { return crypto.createHmac('sha256', config.blindIndexKey).update(normalize(value, type), 'utf8').digest('hex'); }
module.exports = { blindIndex, normalize };
