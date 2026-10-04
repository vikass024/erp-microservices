CREATE TABLE IF NOT EXISTS faculty (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  employee_code VARCHAR(100) NOT NULL UNIQUE,
  department VARCHAR(255) NOT NULL,
  designation VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  record_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
