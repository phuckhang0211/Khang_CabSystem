CREATE TABLE IF NOT EXISTS driver_profiles (
  id UUID PRIMARY KEY, user_id UUID NOT NULL UNIQUE, full_name VARCHAR(120) NOT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (verification_status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  work_status VARCHAR(10) NOT NULL DEFAULT 'OFFLINE' CHECK (work_status IN ('ONLINE','OFFLINE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dp_verification ON driver_profiles(verification_status);
CREATE INDEX IF NOT EXISTS ix_dp_work_status ON driver_profiles(work_status);
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY, driver_id UUID NOT NULL, plate_number_enc TEXT NOT NULL, plate_bidx CHAR(64) NOT NULL UNIQUE,
  vehicle_type VARCHAR(30) NOT NULL, brand VARCHAR(60), model VARCHAR(60), color VARCHAR(40), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vehicles_driver ON vehicles(driver_id);
CREATE TABLE IF NOT EXISTS driver_applications (
  id UUID PRIMARY KEY, driver_id UUID NOT NULL, license_number_enc TEXT NOT NULL, license_bidx CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ, reviewed_by UUID, reject_reason VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS ix_da_driver ON driver_applications(driver_id);
CREATE INDEX IF NOT EXISTS ix_da_status ON driver_applications(status, submitted_at);
CREATE TABLE IF NOT EXISTS driver_state_history (
  id UUID PRIMARY KEY, driver_id UUID NOT NULL, old_work_status VARCHAR(10) NOT NULL CHECK (old_work_status IN ('ONLINE','OFFLINE')),
  new_work_status VARCHAR(10) NOT NULL CHECK (new_work_status IN ('ONLINE','OFFLINE')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dsh_driver ON driver_state_history(driver_id, created_at);
