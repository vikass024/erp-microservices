require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4005;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});
const examFields = ['exam_name', 'course_code', 'exam_date', 'max_marks', 'record_status'];
const resultFields = ['exam_id', 'student_id', 'marks_obtained', 'grade', 'record_status'];
const recordStatuses = ['active', 'archived'];

app.use(express.json());

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.match(/^Bearer\s+(.+)$/i);
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ message: 'A valid bearer token is required' });
  try {
    req.user = jwt.verify(token[1], process.env.JWT_SECRET);
    if (!req.user || !req.user.id || !req.user.email || !req.user.role) throw new Error('Invalid token claims');
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'A valid bearer token is required' });
  }
}

function requireAdminOrFaculty(req, res, next) {
  if (!['admin', 'faculty'].includes(req.user.role)) return res.status(403).json({ message: 'Admin or faculty role is required' });
  return next();
}

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateExam(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const provided = examFields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !examFields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one exam field is required';
  if (!partial && (!body.exam_name || !body.course_code || !body.exam_date || body.max_marks === undefined)) {
    return 'Exam name, course code, exam date, and max marks are required';
  }

  for (const field of provided) {
    const value = body[field];
    if (field === 'record_status') {
      if (!recordStatuses.includes(value)) return 'Record status must be active or archived';
      continue;
    }
    if (field === 'exam_name' || field === 'course_code') {
      if (typeof value !== 'string' || value.trim().length === 0) return `${field} must be a non-empty string`;
      continue;
    }
    if (field === 'exam_date') {
      if (!isValidDate(value)) return 'Exam date must be a valid YYYY-MM-DD date';
      continue;
    }
    if (field === 'max_marks') {
      if (!Number.isInteger(value) || value <= 0) return 'Max marks must be a positive integer';
      continue;
    }
  }
  return null;
}

function validateResult(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const provided = resultFields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !resultFields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one result field is required';
  if (!partial && (!body.exam_id || !body.student_id || body.marks_obtained === undefined)) {
    return 'Exam id, student id, and marks obtained are required';
  }

  for (const field of provided) {
    const value = body[field];
    if (field === 'record_status') {
      if (!recordStatuses.includes(value)) return 'Record status must be active or archived';
      continue;
    }
    if (field === 'exam_id' || field === 'student_id') {
      if (!Number.isInteger(value) || value <= 0) return `${field} must be a positive integer`;
      continue;
    }
    if (field === 'marks_obtained') {
      if (!Number.isInteger(value) || value < 0) return 'Marks obtained must be a non-negative integer';
      continue;
    }
    if (field === 'grade') {
      if (value !== null && typeof value !== 'string') return 'Grade must be a string or null';
      continue;
    }
  }
  return null;
}

async function validateResultMarks(examId, marksObtained) {
  if (!isPositiveInteger(examId)) return { valid: false, message: 'Exam id must be a positive integer' };
  const examResult = await pool.query('SELECT max_marks FROM exams WHERE id = $1 AND record_status = $2', [examId, 'active']);
  if (!examResult.rows[0]) return { valid: false, message: 'Exam not found' };
  if (!Number.isInteger(marksObtained) || marksObtained < 0) return { valid: false, message: 'Marks obtained must be a non-negative integer' };
  if (marksObtained > examResult.rows[0].max_marks) return { valid: false, message: 'Marks obtained cannot exceed max marks for the exam' };
  return { valid: true };
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.use(authenticate);

app.post('/', requireAdminOrFaculty, async (req, res) => {
  const invalid = validateExam(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const values = examFields.map(field => req.body[field] === undefined ? (field === 'record_status' ? 'active' : null) : req.body[field]);
  try {
    const result = await pool.query(
      `INSERT INTO exams (${examFields.join(', ')}) VALUES (${examFields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return res.status(201).json({ exam: result.rows[0] });
  } catch (error) {
    console.error('Exam creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create exam' });
  }
});

app.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'Page and limit must be positive integers; limit cannot exceed 100' });
  }
  if (req.query.course_code !== undefined && (typeof req.query.course_code !== 'string' || req.query.course_code.trim().length === 0)) {
    return res.status(400).json({ message: 'Course code filter must be a non-empty string' });
  }

  const clauses = ["record_status = 'active'"];
  const values = [];

  if (req.query.course_code !== undefined) {
    values.push(req.query.course_code);
    clauses.push(`course_code = $${values.length}`);
  }

  if (req.query.q) {
    values.push(`%${String(req.query.q).trim()}%`);
    clauses.push(`(exam_name ILIKE $${values.length} OR course_code ILIKE $${values.length})`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
  try {
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM exams ${where}`, values);
    const total = count.rows[0].total;
    const listValues = [...values, limit, (page - 1) * limit];
    const result = await pool.query(
      `SELECT * FROM exams ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues
    );
    return res.status(200).json({ exams: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Exam listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list exams' });
  }
});

app.post('/results', requireAdminOrFaculty, async (req, res) => {
  const invalid = validateResult(req.body);
  if (invalid) return res.status(400).json({ message: invalid });

  const checks = await validateResultMarks(req.body.exam_id, req.body.marks_obtained);
  if (!checks.valid) return checks.message === 'Exam not found' ? res.status(404).json({ message: checks.message }) : res.status(400).json({ message: checks.message });

  const values = resultFields.map(field => req.body[field] === undefined ? (field === 'record_status' ? 'active' : null) : req.body[field]);
  try {
    const result = await pool.query(
      `INSERT INTO results (${resultFields.join(', ')}) VALUES (${resultFields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return res.status(201).json({ result: result.rows[0] });
  } catch (error) {
    console.error('Result creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create result' });
  }
});

app.get('/results', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'Page and limit must be positive integers; limit cannot exceed 100' });
  }
  if (req.query.exam_id !== undefined && (!/^\d+$/.test(String(req.query.exam_id)) || Number(req.query.exam_id) < 1)) {
    return res.status(400).json({ message: 'Exam id filter must be a positive integer' });
  }
  if (req.query.student_id !== undefined && (!/^\d+$/.test(String(req.query.student_id)) || Number(req.query.student_id) < 1)) {
    return res.status(400).json({ message: 'Student id filter must be a positive integer' });
  }

  const clauses = ["record_status = 'active'"];
  const values = [];
  if (req.query.exam_id !== undefined) {
    values.push(Number(req.query.exam_id));
    clauses.push(`exam_id = $${values.length}`);
  }
  if (req.query.student_id !== undefined) {
    values.push(Number(req.query.student_id));
    clauses.push(`student_id = $${values.length}`);
  }
  if (req.query.q) {
    values.push(`%${String(req.query.q).trim()}%`);
    clauses.push(`(grade ILIKE $${values.length} OR CAST(student_id AS TEXT) ILIKE $${values.length})`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;
  try {
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM results ${where}`, values);
    const total = count.rows[0].total;
    const listValues = [...values, limit, (page - 1) * limit];
    const result = await pool.query(
      `SELECT * FROM results ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues
    );
    return res.status(200).json({ results: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Result listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list results' });
  }
});

app.get('/results/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Result id must be a positive integer' });
  try {
    const result = await pool.query("SELECT * FROM results WHERE id = $1 AND record_status = 'active'", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Result not found' });
    return res.status(200).json({ result: result.rows[0] });
  } catch (error) {
    console.error('Result lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get result' });
  }
});

app.put('/results/:id', requireAdminOrFaculty, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Result id must be a positive integer' });
  const invalid = validateResult(req.body, true);
  if (invalid) return res.status(400).json({ message: invalid });

  const resultRow = await pool.query("SELECT * FROM results WHERE id = $1 AND record_status = 'active'", [Number(req.params.id)]);
  if (!resultRow.rows[0]) return res.status(404).json({ message: 'Result not found' });

  const nextExamId = req.body.exam_id !== undefined ? Number(req.body.exam_id) : resultRow.rows[0].exam_id;
  const nextMarks = req.body.marks_obtained !== undefined ? Number(req.body.marks_obtained) : resultRow.rows[0].marks_obtained;
  const checks = await validateResultMarks(nextExamId, nextMarks);
  if (!checks.valid) return checks.message === 'Exam not found' ? res.status(404).json({ message: checks.message }) : res.status(400).json({ message: checks.message });

  const updates = resultFields.filter(field => Object.prototype.hasOwnProperty.call(req.body, field));
  if (updates.length === 0) return res.status(400).json({ message: 'At least one result field is required' });
  const assignments = updates.map((field, index) => `${field} = $${index + 1}`);
  try {
    const result = await pool.query(
      `UPDATE results SET ${assignments.join(', ')} WHERE id = $${updates.length + 1} AND record_status = 'active' RETURNING *`,
      [...updates.map(field => req.body[field]), Number(req.params.id)]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Result not found' });
    return res.status(200).json({ result: result.rows[0] });
  } catch (error) {
    console.error('Result update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update result' });
  }
});

app.delete('/results/:id', requireAdminOrFaculty, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Result id must be a positive integer' });
  try {
    const result = await pool.query("UPDATE results SET record_status = 'archived' WHERE id = $1 AND record_status = 'active' RETURNING *", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Result not found' });
    return res.status(200).json({ result: result.rows[0] });
  } catch (error) {
    console.error('Result deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to archive result' });
  }
});

app.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Exam id must be a positive integer' });
  try {
    const result = await pool.query("SELECT * FROM exams WHERE id = $1 AND record_status = 'active'", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Exam not found' });
    return res.status(200).json({ exam: result.rows[0] });
  } catch (error) {
    console.error('Exam lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get exam' });
  }
});

app.put('/:id', requireAdminOrFaculty, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Exam id must be a positive integer' });
  const invalid = validateExam(req.body, true);
  if (invalid) return res.status(400).json({ message: invalid });
  const updates = examFields.filter(field => Object.prototype.hasOwnProperty.call(req.body, field));
  if (updates.length === 0) return res.status(400).json({ message: 'At least one exam field is required' });
  const assignments = updates.map((field, index) => `${field} = $${index + 1}`);
  try {
    const result = await pool.query(
      `UPDATE exams SET ${assignments.join(', ')} WHERE id = $${updates.length + 1} AND record_status = 'active' RETURNING *`,
      [...updates.map(field => req.body[field]), Number(req.params.id)]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Exam not found' });
    return res.status(200).json({ exam: result.rows[0] });
  } catch (error) {
    console.error('Exam update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update exam' });
  }
});

app.delete('/:id', requireAdminOrFaculty, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Exam id must be a positive integer' });
  try {
    const result = await pool.query("UPDATE exams SET record_status = 'archived' WHERE id = $1 AND record_status = 'active' RETURNING *", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Exam not found' });
    return res.status(200).json({ exam: result.rows[0] });
  } catch (error) {
    console.error('Exam deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to archive exam' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

if (require.main === module) app.listen(port, () => console.log(`Exam service listening on port ${port}`));

module.exports = app;
