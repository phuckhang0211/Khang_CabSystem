CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email_enc TEXT NOT NULL,
  email_bidx CHAR(64) NOT NULL UNIQUE,
  phone_enc TEXT,
  phone_bidx CHAR(64),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER','DRIVER','ADMIN')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone_bidx ON users(phone_bidx) WHERE phone_bidx IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role);
CREATE INDEX IF NOT EXISTS ix_users_status ON users(status);
