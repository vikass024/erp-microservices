CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  course_code VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  credits INTEGER NOT NULL CHECK (credits BETWEEN 1 AND 6),
  department VARCHAR(255),
  semester INTEGER,
  instructor_name VARCHAR(255),
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
