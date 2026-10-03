const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const student = { roll_number: 'R001', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

beforeEach(() => mockQuery.mockReset());

test('requires a valid token for student routes', async () => {
  const missing = await request(app).get('/');
  const invalid = await request(app).get('/').set('Authorization', 'Bearer bad-token');
  expect(missing.status).toBe(401);
  expect(invalid.status).toBe(401);
});

test('allows reads for any authenticated role and rejects writes without admin', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
  expect((await request(app).get('/').set('Authorization', `Bearer ${token('employee')}`)).status).toBe(200);
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('employee')}`).send(student)).status).toBe(403);
});

test('validates create input', async () => {
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send({ roll_number: '' });
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('message');
});

test('creates, reads, updates, and soft deletes a student', async () => {
  const row = { id: 1, ...student, status: 'active' };
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(student)).status).toBe(201);
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).get('/1').set('Authorization', `Bearer ${token('employee')}`)).body.student.id).toBe(1);
  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, first_name: 'Augusta' }] });
  expect((await request(app).put('/1').set('Authorization', `Bearer ${token('admin')}`).send({ first_name: 'Augusta' })).body.student.first_name).toBe('Augusta');
  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, status: 'inactive' }] });
  expect((await request(app).delete('/1').set('Authorization', `Bearer ${token('admin')}`)).body.student.status).toBe('inactive');
});

test('returns 409 when a unique value conflicts', async () => {
  mockQuery.mockRejectedValueOnce({ code: '23505' });
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(student);
  expect(response.status).toBe(409);
});
