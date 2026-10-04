require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4004;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});
const fields = ['name', 'employee_code', 'department', 'designation', 'email', 'phone', 'record_status'];
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

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin role is required' });
  return next();
}

function validateFaculty(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const provided = fields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !fields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one faculty field is required';
  if (!partial && ['name', 'employee_code', 'department', 'designation', 'email'].some(field => !body[field])) {
    return 'Name, employee code, department, designation, and email are required';
  }
  for (const field of provided) {
    const value = body[field];
    if (field === 'phone' && value === null) continue;
    if (field === 'email') {
      if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'A valid email address is required';
    } else if (field === 'record_status') {
      if (!recordStatuses.includes(value)) return 'Record status must be active or archived';
    } else if (typeof value !== 'string' || (field !== 'phone' && value.trim().length === 0)) {
      return `${field} must be a valid string`;
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

app.post('/', requireAdmin, async (req, res) => {
  const invalid = validateFaculty(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const values = fields.map(field => req.body[field] === undefined ? (field === 'record_status' ? 'active' : null) : req.body[field]);
  try {
    const result = await pool.query(
      `INSERT INTO faculty (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      values
    );
    return res.status(201).json({ faculty: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'A faculty member with this employee code or email already exists' });
    console.error('Faculty creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create faculty member' });
  }
});

app.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'Page and limit must be positive integers; limit cannot exceed 100' });
  }
  if (req.query.department !== undefined && typeof req.query.department !== 'string') {
    return res.status(400).json({ message: 'Department filter must be a string' });
  }
  const clauses = ["record_status = 'active'"];
  const values = [];
  if (req.query.department !== undefined) {
    values.push(req.query.department);
    clauses.push(`department = $${values.length}`);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  try {
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM faculty ${where}`, values);
    const total = count.rows[0].total;
    const listValues = [...values, limit, (page - 1) * limit];
    const result = await pool.query(
      `SELECT * FROM faculty ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      listValues
    );
    return res.status(200).json({ faculties: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Faculty listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list faculty' });
  }
});

app.get('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Faculty id must be a positive integer' });
  try {
    const result = await pool.query('SELECT * FROM faculty WHERE id = $1', [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Faculty member not found' });
    return res.status(200).json({ faculty: result.rows[0] });
  } catch (error) {
    console.error('Faculty lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get faculty member' });
  }
});

app.put('/:id', requireAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Faculty id must be a positive integer' });
  const invalid = validateFaculty(req.body, true);
  if (invalid) return res.status(400).json({ message: invalid });
  const updates = fields.filter(field => Object.prototype.hasOwnProperty.call(req.body, field));
  const assignments = updates.map((field, index) => `${field} = $${index + 1}`);
  try {
    const result = await pool.query(
      `UPDATE faculty SET ${assignments.join(', ')} WHERE id = $${updates.length + 1} RETURNING *`,
      [...updates.map(field => req.body[field]), Number(req.params.id)]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Faculty member not found' });
    return res.status(200).json({ faculty: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'A faculty member with this employee code or email already exists' });
    console.error('Faculty update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update faculty member' });
  }
});

app.delete('/:id', requireAdmin, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Faculty id must be a positive integer' });
  try {
    const result = await pool.query("UPDATE faculty SET record_status = 'archived' WHERE id = $1 RETURNING *", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Faculty member not found' });
    return res.status(200).json({ faculty: result.rows[0] });
  } catch (error) {
    console.error('Faculty deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to archive faculty member' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

if (require.main === module) app.listen(port, () => console.log(`Faculty service listening on port ${port}`));

module.exports = app;
