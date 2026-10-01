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
  const { name, email, password, role = 'employee' } = req.body || {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters long' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }
  if (typeof role !== 'string' || role.trim().length === 0 || role.length > 50) {
    return res.status(400).json({ message: 'Role must be a non-empty string up to 50 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, role.trim()]
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
