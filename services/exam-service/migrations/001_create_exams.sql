CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  exam_name VARCHAR(255) NOT NULL,
  course_code VARCHAR(50) NOT NULL,
  exam_date DATE NOT NULL,
  max_marks INTEGER NOT NULL CHECK (max_marks > 0),
  record_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER REFERENCES exams(id),
  student_id INTEGER NOT NULL,
  marks_obtained INTEGER NOT NULL CHECK (marks_obtained >= 0),
  grade TEXT,
  record_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
