require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4007;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

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

function validateNotification(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object';
  const fields = ['title', 'message', 'target_role'];
  const provided = fields.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (Object.keys(body).some(field => !fields.includes(field))) return 'Request contains an unsupported field';
  if (partial && provided.length === 0) return 'At least one notification field is required';
  if (!partial && (!body.title || !body.message)) return 'Title and message are required';

  for (const field of provided) {
    const value = body[field];
    if (field === 'title') {
      if (typeof value !== 'string' || value.trim().length === 0) return 'Title must be a non-empty string';
    } else if (field === 'message') {
      if (typeof value !== 'string' || value.trim().length === 0) return 'Message must be a non-empty string';
    } else if (field === 'target_role') {
      if (value !== null && value !== undefined && typeof value !== 'string') return 'Target role must be a string or null';
      if (value !== null && value !== undefined && !['student', 'faculty'].includes(value)) return 'Target role must be student, faculty, or null';
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

app.post('/', requireAdminOrFaculty, async (req, res) => {
  const invalid = validateNotification(req.body);
  if (invalid) return res.status(400).json({ message: invalid });

  const { title, message, target_role = null } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO notifications (title, message, target_role, created_by, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [title.trim(), message.trim(), target_role, req.user.id]
    );
    return res.status(201).json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Notification creation failed:', error.message);
    return res.status(500).json({ message: 'Unable to create notification' });
  }
});

app.get('/', async (req, res) => {
  const targetRole = req.query.target_role;
  const clauses = [];
  const values = [];

  if (targetRole !== undefined) {
    const normalized = String(targetRole).toLowerCase();
    if (!['student', 'faculty', 'all', 'everyone', 'null'].includes(normalized)) {
      return res.status(400).json({ message: 'Target role must be student, faculty, all, everyone, or null' });
    }

    if (normalized === 'all' || normalized === 'everyone' || normalized === 'null') {
      clauses.push('target_role IS NULL');
    } else {
      values.push(normalized);
      clauses.push('(target_role = $1 OR target_role IS NULL)');
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  try {
    const result = await pool.query(`SELECT * FROM notifications ${where} ORDER BY created_at DESC, id DESC`, values);
    return res.status(200).json({ notifications: result.rows });
  } catch (error) {
    console.error('Notification listing failed:', error.message);
    return res.status(500).json({ message: 'Unable to list notifications' });
  }
});

app.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Notification id must be a positive integer' });
  try {
    const result = await pool.query('SELECT * FROM notifications WHERE id = $1', [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Notification lookup failed:', error.message);
    return res.status(500).json({ message: 'Unable to get notification' });
  }
});

app.delete('/:id', requireAdminOrFaculty, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) return res.status(400).json({ message: 'Notification id must be a positive integer' });
  try {
    const result = await pool.query('DELETE FROM notifications WHERE id = $1 RETURNING *', [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Notification deletion failed:', error.message);
    return res.status(500).json({ message: 'Unable to delete notification' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON' });
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

if (require.main === module) app.listen(port, () => console.log(`Notification service listening on port ${port}`));

module.exports = app;
