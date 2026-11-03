CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE,
  customer_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  fare BIGINT NOT NULL CHECK (fare >= 0),
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_address VARCHAR(255),
  dest_lat DOUBLE PRECISION,
  dest_lng DOUBLE PRECISION,
  dest_address VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'DRIVER_ARRIVING' CHECK (status IN ('DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELED')),
  payment_status VARCHAR(10) NOT NULL DEFAULT 'PAID' CHECK (payment_status = 'PAID'),
  paid_at TIMESTAMPTZ NOT NULL,
  last_lat DOUBLE PRECISION CHECK (last_lat BETWEEN -90 AND 90),
  last_lng DOUBLE PRECISION CHECK (last_lng BETWEEN -180 AND 180),
  location_updated_at TIMESTAMPTZ,
  end_lat DOUBLE PRECISION, end_lng DOUBLE PRECISION,
  arrived_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, canceled_at TIMESTAMPTZ,
  canceled_by VARCHAR(10) CHECK (canceled_by IN ('CUSTOMER','DRIVER')),
  cancel_reason VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS pickup_address VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS dest_address VARCHAR(255);
CREATE INDEX IF NOT EXISTS ix_trips_customer ON trips(customer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_trips_driver ON trips(driver_id, created_at);
CREATE INDEX IF NOT EXISTS ix_trips_payment ON trips(payment_id);
CREATE INDEX IF NOT EXISTS ix_trips_status ON trips(status);
