/* Generates the ignored local development .env without printing any values. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
const dbs = ['AUTH', 'CUSTOMER', 'DRIVER', 'BOOKING', 'TRIP', 'PAYMENT', 'NOTIFY'];
const generatedSecretNames = new Set([
  'JWT_SECRET',
  'INTERNAL_SERVICE_TOKEN',
  'BLIND_INDEX_KEY',
  'PAYMENT_CALLBACK_SECRET',
  'RABBITMQ_DEFAULT_PASS',
  ...dbs.map((name) => `${name}_DB_PASSWORD`)
]);

function parse(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at > 0) values[line.slice(0, at)] = line.slice(at + 1);
  }
  return values;
}

function isInvalid(value, minimumLength = 32) {
  return !value
    || ['undefined', 'null', 'NaN'].includes(value)
    || value.startsWith('<')
    || value.includes('replace-with-')
    || value.length < minimumLength;
}

const example = parse(fs.readFileSync(examplePath, 'utf8'));
const current = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath, 'utf8')) : {};
const values = { ...example, ...current };

for (const name of generatedSecretNames) {
  if (isInvalid(values[name])) values[name] = crypto.randomBytes(32).toString('hex');
}
if (isInvalid(values.ENCRYPTION_KEY_V1, 1) || (() => {
  try { return Buffer.from(values.ENCRYPTION_KEY_V1, 'base64').length !== 32; } catch (_) { return true; }
})()) values.ENCRYPTION_KEY_V1 = crypto.randomBytes(32).toString('base64');

for (const name of dbs) {
  values[`${name}_DATABASE_URL`] = `postgres://${values[`${name}_DB_USER`]}:${values[`${name}_DB_PASSWORD`]}@${name.toLowerCase()}-db:5432/${values[`${name}_DB_NAME`]}`;
}
values.RABBITMQ_URL = `amqp://${values.RABBITMQ_DEFAULT_USER}:${values.RABBITMQ_DEFAULT_PASS}@rabbitmq:5672`;

const output = Object.keys(example).map((name) => `${name}=${values[name] ?? ''}`).join('\n') + '\n';
fs.writeFileSync(envPath, output, { encoding: 'utf8', mode: 0o600 });
process.stdout.write('Generated .env; secret values were not printed.\n');
