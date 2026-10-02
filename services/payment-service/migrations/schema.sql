-- Payment service schema is added in a later task.
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE,
  customer_id UUID NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  provider VARCHAR(10) NOT NULL DEFAULT 'MOCK' CHECK (provider = 'MOCK'),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  provider_txn_id VARCHAR(120),
  payment_url TEXT NOT NULL,
  failure_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_txn ON payments(provider_txn_id) WHERE provider_txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pay_customer ON payments(customer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_pay_status ON payments(status);
