require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 4000;
const bcryptRounds = 12;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

app.use(express.json());

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function userResponse(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}

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

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters long' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, 'employee']
    );

    return res.status(201).json({ user: userResponse(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }
    console.error('Registration failed:', error.message);
    return res.status(500).json({ message: 'Unable to register user' });
  }
});

app.patch('/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
    return res.status(400).json({ message: 'User id must be a positive integer' });
  }
  const roles = ['admin', 'employee', 'faculty', 'student'];
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !roles.includes(req.body.role)) {
    return res.status(400).json({ message: 'Role must be admin, employee, faculty, or student' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, created_at',
      [req.body.role, Number(req.params.id)]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ user: userResponse(result.rows[0]) });
  } catch (error) {
    console.error('Role update failed:', error.message);
    return res.status(500).json({ message: 'Unable to update user role' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!validEmail(email) || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'Valid email and password are required' });
  }
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return res.status(500).json({ message: 'Authentication service is not configured' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({ token, user: userResponse(user) });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ message: 'Unable to log in' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }
  console.error('Unhandled request error:', error.message);
  return res.status(500).json({ message: 'Internal server error' });
});

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

app.listen(port, () => {
  console.log(`Auth service listening on port ${port}`);
});
