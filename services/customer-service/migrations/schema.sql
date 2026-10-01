CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, customer_id)
);

CREATE INDEX IF NOT EXISTS ix_reviews_trip ON reviews(trip_id);
CREATE INDEX IF NOT EXISTS ix_reviews_customer ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS ix_reviews_driver ON reviews(driver_id);
