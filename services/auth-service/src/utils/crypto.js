const crypto = require('crypto');
const config = require('../config');

function getKey(keyId) {
  if (keyId !== 'v1' && keyId !== 'v2') throw new Error('Unsupported encryption key id');

  const encodedKey = keyId === 'v1' ? config.encryptionKeyV1 : config.encryptionKeyV2;
  if (!encodedKey) throw new Error('Encryption key is not configured');

  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be a base64-encoded 32-byte value');
  return key;
}

function encrypt(plaintext) {
  const keyId = config.encryptionActiveKeyId;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(keyId), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${keyId}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decrypt(value) {
  const parts = String(value).split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted value');

  const [keyId, ivBase64, tagBase64, ciphertextBase64] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Invalid encrypted value');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(keyId), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
