const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const registration = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' };

beforeEach(() => mockQuery.mockReset());

test('health returns ok', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});

test('register ignores an admin role in the body and creates an employee', async () => {
  const user = { id: 1, name: registration.name, email: registration.email, role: 'employee', created_at: '2026-01-01' };
  mockQuery.mockResolvedValueOnce({ rows: [user] });
  const response = await request(app).post('/register').send({ ...registration, role: 'admin' });
  expect(response.status).toBe(201);
  expect(response.body.user.role).toBe('employee');
  expect(mockQuery.mock.calls[0][1][3]).toBe('employee');
});

test('register rejects missing or invalid fields', async () => {
  const missing = await request(app).post('/register').send({});
  const invalid = await request(app).post('/register').send({ ...registration, email: 'invalid-email' });
  expect(missing.status).toBe(400);
  expect(invalid.status).toBe(400);
  expect(mockQuery).not.toHaveBeenCalled();
});

test('login with correct credentials returns a token', async () => {
  const passwordHash = await bcrypt.hash('password123', 4);
  const user = { id: 1, name: registration.name, email: registration.email, password_hash: passwordHash, role: 'employee', created_at: '2026-01-01' };
  mockQuery.mockResolvedValueOnce({ rows: [user] });
  const response = await request(app).post('/login').send({ email: registration.email, password: 'password123' });
  expect(response.status).toBe(200);
  expect(typeof response.body.token).toBe('string');
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).role).toBe('employee');
});

test('login with a wrong password returns 401', async () => {
  const passwordHash = await bcrypt.hash('password123', 4);
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, email: registration.email, name: registration.name, password_hash: passwordHash, role: 'employee' }] });
  const response = await request(app).post('/login').send({ email: registration.email, password: 'wrong-password' });
  expect(response.status).toBe(401);
});

test('role update rejects non-admins and succeeds for admins', async () => {
  const forbidden = await request(app).patch('/users/2/role').set('Authorization', `Bearer ${token('employee')}`).send({ role: 'admin' });
  expect(forbidden.status).toBe(403);
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, name: 'Grace Hopper', email: 'grace@example.com', role: 'admin' }] });
  const success = await request(app).patch('/users/2/role').set('Authorization', `Bearer ${token('admin')}`).send({ role: 'admin' });
  expect(success.status).toBe(200);
  expect(success.body.user.role).toBe('admin');
});
