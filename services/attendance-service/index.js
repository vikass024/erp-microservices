require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4003;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});
const fields = ['student_id', 'date', 'status', 'remarks'];
const attendanceStatuses = ['present', 'absent', 'leave'];

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
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateAttendance(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const provided = fields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !fields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one attendance field is required';
  if (!partial && (!Object.prototype.hasOwnProperty.call(body, 'student_id') || !body.date || !body.status)) return 'Student id, date, and status are required';
  for (const field of provided) {
    const value = body[field];
    if (field === 'remarks' && value === null) continue;
    if (field === 'student_id') {
      if (!Number.isInteger(value) || value < 1) return 'Student id must be a positive integer';
    } else if (field === 'date') {
      if (!isValidDate(value)) return 'Date must use YYYY-MM-DD format';
    } else if (field === 'status') {
      if (!attendanceStatuses.includes(value)) return 'Status must be present, absent, or leave';
    } else if (typeof value !== 'string') {
      return 'Remarks must be a string or null';
    }
  }
  return null;
}

function isValidId(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
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
  const invalid = validateAttendance(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const values = fields.map(field => req.body[field] === undefined ? null : req.body[field]);
  try {
    const result = await pool.query(
      `INSERT INTO attendance (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return res.status(201).json({ attendance: result.rows[0] });
  } catch (error) {
    console.error('Attendance creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create attendance record' });
  }
});

app.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'Page and limit must be positive integers; limit cannot exceed 100' });
  if (req.query.student_id !== undefined && (!/^\d+$/.test(req.query.student_id) || Number(req.query.student_id) < 1)) return res.status(400).json({ message: 'Student id must be a positive integer' });
  if (req.query.date !== undefined && !isValidDate(req.query.date)) return res.status(400).json({ message: 'Date must use YYYY-MM-DD format' });
  if (req.query.status !== undefined && !attendanceStatuses.includes(req.query.status)) return res.status(400).json({ message: 'Invalid status filter' });

  const clauses = ["record_status = 'active'"];
  const values = [];
  for (const field of ['student_id', 'date', 'status']) {
    if (req.query[field] !== undefined) {
      values.push(field === 'student_id' ? Number(req.query[field]) : req.query[field]);
      clauses.push(`${field} = $${values.length}`);
    }
  }
  if (req.query.q) {
    values.push(`%${req.query.q}%`);
    clauses.push(`(student_id::text ILIKE $${values.length} OR date::text ILIKE $${values.length} OR status ILIKE $${values.length} OR remarks ILIKE $${values.length})`);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  try {
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM attendance ${where}`, values);
    const total = count.rows[0].total;
    const listValues = [...values, limit, (page - 1) * limit];
    const result = await pool.query(`SELECT * FROM attendance ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, listValues);
    return res.status(200).json({ attendances: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Attendance listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list attendance records' });
  }
});

app.get('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Attendance id must be a positive integer' });
  try {
    const result = await pool.query("SELECT * FROM attendance WHERE id = $1 AND record_status = 'active'", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Attendance record not found' });
    return res.status(200).json({ attendance: result.rows[0] });
  } catch (error) {
    console.error('Attendance lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get attendance record' });
  }
});

app.put('/:id', requireAdminOrFaculty, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Attendance id must be a positive integer' });
  const invalid = validateAttendance(req.body, true);
  if (invalid) return res.status(400).json({ message: invalid });
  const updates = fields.filter(field => Object.prototype.hasOwnProperty.call(req.body, field));
  const assignments = updates.map((field, index) => `${field} = $${index + 1}`);
  try {
    const result = await pool.query(`UPDATE attendance SET ${assignments.join(', ')} WHERE id = $${updates.length + 1} AND record_status = 'active' RETURNING *`, [...updates.map(field => req.body[field]), Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Attendance record not found' });
    return res.status(200).json({ attendance: result.rows[0] });
  } catch (error) {
    console.error('Attendance update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update attendance record' });
  }
});

app.delete('/:id', requireAdminOrFaculty, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Attendance id must be a positive integer' });
  try {
    const result = await pool.query("UPDATE attendance SET record_status = 'archived' WHERE id = $1 AND record_status = 'active' RETURNING *", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Attendance record not found' });
    return res.status(200).json({ attendance: result.rows[0] });
  } catch (error) {
    console.error('Attendance deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to archive attendance record' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

if (require.main === module) app.listen(port, () => console.log(`Attendance service listening on port ${port}`));

module.exports = app;