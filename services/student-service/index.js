require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4001;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});
const fields = ['roll_number', 'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'department', 'program', 'year_of_study', 'status'];
const statuses = ['active', 'inactive', 'graduated'];

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

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role is required' });
  return next();
}

function validateStudent(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const provided = fields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !fields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one student field is required';
  if (!partial && (!body.roll_number || !body.first_name || !body.last_name)) return 'Roll number, first name, and last name are required';
  for (const field of provided) {
    const value = body[field];
    if (value === null && ['email', 'phone', 'date_of_birth', 'department', 'program', 'year_of_study'].includes(field)) continue;
    if (field === 'year_of_study') {
      if (!Number.isInteger(value) || value < 1) return 'Year of study must be a positive integer';
    } else if (field === 'status') {
      if (!statuses.includes(value)) return 'Status must be active, inactive, or graduated';
    } else if (field === 'email') {
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'A valid email address is required';
    } else if (field === 'date_of_birth') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return 'Date of birth must use YYYY-MM-DD format';
    } else if (typeof value !== 'string' || (['roll_number', 'first_name', 'last_name'].includes(field) && value.trim().length === 0)) {
      return `${field} must be a valid string`;
    }
  }
  return null;
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

app.post('/', requireAdmin, async (req, res) => {
  const invalid = validateStudent(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const values = fields.map(field => req.body[field] === undefined ? (field === 'status' ? 'active' : null) : req.body[field]);
  try {
    const result = await pool.query(
      `INSERT INTO students (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return res.status(201).json({ student: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'A student with this roll number or email already exists' });
    console.error('Student creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create student' });
  }
});

app.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'Page and limit must be positive integers; limit cannot exceed 100' });
  if (req.query.year_of_study !== undefined && (!/^\d+$/.test(req.query.year_of_study) || Number(req.query.year_of_study) < 1)) return res.status(400).json({ message: 'Year of study must be a positive integer' });
  if (req.query.status && !statuses.includes(req.query.status)) return res.status(400).json({ message: 'Invalid status filter' });
  const clauses = [];
  const values = [];
  for (const field of ['department', 'status', 'year_of_study']) {
    if (req.query[field] !== undefined) {
      values.push(field === 'year_of_study' ? Number(req.query[field]) : req.query[field]);
      clauses.push(`${field} = $${values.length}`);
    }
  }
  if (req.query.q) {
    values.push(`%${req.query.q}%`);
    clauses.push(`(roll_number ILIKE $${values.length} OR first_name ILIKE $${values.length} OR last_name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  try {
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM students ${where}`, values);
    const total = count.rows[0].total;
    const listValues = [...values, limit, (page - 1) * limit];
    const result = await pool.query(`SELECT * FROM students ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, listValues);
    return res.status(200).json({ students: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Student listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list students' });
  }
});

app.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Student id must be a positive integer' });
  try {
    const result = await pool.query('SELECT * FROM students WHERE id = $1', [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Student not found' });
    return res.status(200).json({ student: result.rows[0] });
  } catch (error) {
    console.error('Student lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get student' });
  }
});

app.put('/:id', requireAdmin, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Student id must be a positive integer' });
  const invalid = validateStudent(req.body, true);
  if (invalid) return res.status(400).json({ message: invalid });
  const updates = fields.filter(field => Object.prototype.hasOwnProperty.call(req.body, field));
  const assignments = updates.map((field, index) => `${field} = $${index + 1}`);
  assignments.push('updated_at = CURRENT_TIMESTAMP');
  try {
    const result = await pool.query(`UPDATE students SET ${assignments.join(', ')} WHERE id = $${updates.length + 1} RETURNING *`, [...updates.map(field => req.body[field]), Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Student not found' });
    return res.status(200).json({ student: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'A student with this roll number or email already exists' });
    console.error('Student update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update student' });
  }
});

app.delete('/:id', requireAdmin, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Student id must be a positive integer' });
  try {
    const result = await pool.query("UPDATE students SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Student not found' });
    return res.status(200).json({ student: result.rows[0] });
  } catch (error) {
    console.error('Student deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to deactivate student' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

if (require.main === module) app.listen(port, () => console.log(`Student service listening on port ${port}`));

module.exports = app;
