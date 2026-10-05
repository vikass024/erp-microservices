require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4006;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});
const fields = ['student_id', 'fee_type', 'amount', 'due_date', 'status', 'paid_date'];
const statuses = ['pending', 'paid', 'overdue'];

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

function validateFee(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const provided = fields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !fields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one fee field is required';
  if (!partial && (!body.student_id || !body.fee_type || !body.amount || !body.due_date || !body.status)) return 'Student id, fee type, amount, due date, and status are required';

  for (const field of provided) {
    const value = body[field];
    if (value === null && field === 'paid_date') continue;
    if (field === 'student_id') {
      if (!Number.isInteger(value) || value < 1) return 'Student id must be a positive integer';
    } else if (field === 'fee_type') {
      if (typeof value !== 'string' || value.trim().length === 0) return 'Fee type must be a non-empty string';
    } else if (field === 'amount') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return 'Amount must be a non-negative number';
    } else if (field === 'due_date' || field === 'paid_date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return `${field === 'due_date' ? 'Due date' : 'Paid date'} must use YYYY-MM-DD format`;
    } else if (field === 'status') {
      if (!statuses.includes(value)) return 'Status must be pending, paid, or overdue';
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
  const invalid = validateFee(req.body);
  if (invalid) return res.status(400).json({ message: invalid });
  const values = fields.map(field => {
    if (field === 'amount') return Number(req.body[field]);
    if (field === 'record_status') return 'active';
    return req.body[field] === undefined ? null : req.body[field];
  });

  try {
    const result = await pool.query(
      `INSERT INTO fees (student_id, fee_type, amount, due_date, status, paid_date, record_status) VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING *`,
      [
        req.body.student_id,
        req.body.fee_type,
        Number(req.body.amount),
        req.body.due_date,
        req.body.status,
        req.body.paid_date || null
      ]
    );
    return res.status(201).json({ fee: result.rows[0] });
  } catch (error) {
    console.error('Fee creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create fee' });
  }
});

app.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'Page and limit must be positive integers; limit cannot exceed 100' });
  if (req.query.student_id !== undefined && (!/^\d+$/.test(req.query.student_id) || Number(req.query.student_id) < 1)) return res.status(400).json({ message: 'Student id must be a positive integer' });
  if (req.query.status && !statuses.includes(req.query.status)) return res.status(400).json({ message: 'Invalid status filter' });

  const clauses = ['record_status = $1'];
  const values = ['active'];

  for (const field of ['student_id', 'status']) {
    if (req.query[field] !== undefined) {
      values.push(field === 'student_id' ? Number(req.query[field]) : req.query[field]);
      clauses.push(`${field} = $${values.length}`);
    }
  }

  if (req.query.q) {
    values.push(`%${req.query.q}%`);
    clauses.push(`(fee_type ILIKE $${values.length} OR status ILIKE $${values.length})`);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  try {
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM fees ${where}`, values);
    const total = count.rows[0].total;
    const listValues = [...values, limit, (page - 1) * limit];
    const result = await pool.query(`SELECT * FROM fees ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, listValues);
    return res.status(200).json({ fees: result.rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Fee listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list fees' });
  }
});

app.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Fee id must be a positive integer' });
  try {
    const result = await pool.query('SELECT * FROM fees WHERE id = $1 AND record_status = $2', [Number(req.params.id), 'active']);
    if (!result.rows[0]) return res.status(404).json({ message: 'Fee not found' });
    return res.status(200).json({ fee: result.rows[0] });
  } catch (error) {
    console.error('Fee lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get fee' });
  }
});

app.put('/:id', requireAdmin, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Fee id must be a positive integer' });
  const invalid = validateFee(req.body, true);
  if (invalid) return res.status(400).json({ message: invalid });
  const updates = fields.filter(field => Object.prototype.hasOwnProperty.call(req.body, field));
  const assignments = updates.map((field, index) => `${field} = $${index + 1}`);
  try {
    const result = await pool.query(
      `UPDATE fees SET ${assignments.join(', ')} WHERE id = $${updates.length + 1} AND record_status = 'active' RETURNING *`,
      [...updates.map(field => field === 'amount' ? Number(req.body[field]) : req.body[field]), Number(req.params.id)]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Fee not found' });
    return res.status(200).json({ fee: result.rows[0] });
  } catch (error) {
    console.error('Fee update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update fee' });
  }
});

app.delete('/:id', requireAdmin, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Fee id must be a positive integer' });
  try {
    const result = await pool.query("UPDATE fees SET record_status = 'archived' WHERE id = $1 AND record_status = 'active' RETURNING *", [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Fee not found' });
    return res.status(200).json({ fee: result.rows[0] });
  } catch (error) {
    console.error('Fee deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to archive fee' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

if (require.main === module) app.listen(port, () => console.log(`Fees service listening on port ${port}`));

module.exports = app;
