const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const fee = { student_id: 5, fee_type: 'tuition', amount: 2500, due_date: '2026-10-15', status: 'pending' };

beforeEach(() => mockQuery.mockReset());

test('requires a valid token for fee routes', async () => {
  const missing = await request(app).get('/');
  const invalid = await request(app).get('/').set('Authorization', 'Bearer bad-token');
  expect(missing.status).toBe(401);
  expect(invalid.status).toBe(401);
});

test('allows reads for any authenticated role and rejects writes without admin', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
  expect((await request(app).get('/').set('Authorization', `Bearer ${token('student')}`)).status).toBe(200);
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('student')}`).send(fee)).status).toBe(403);
});

test('validates create input', async () => {
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send({ student_id: '', fee_type: '', amount: -1, due_date: 'bad-date', status: 'bad' });
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('message');
});

test('creates, reads, updates, and soft deletes a fee', async () => {
  const row = { id: 1, ...fee, paid_date: null, record_status: 'active' };
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(fee)).status).toBe(201);

  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).get('/1').set('Authorization', `Bearer ${token('student')}`)).body.fee.id).toBe(1);

  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, amount: 2750 }] });
  expect((await request(app).put('/1').set('Authorization', `Bearer ${token('admin')}`).send({ amount: 2750 })).body.fee.amount).toBe(2750);

  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, record_status: 'archived' }] });
  expect((await request(app).delete('/1').set('Authorization', `Bearer ${token('admin')}`)).body.fee.record_status).toBe('archived');
});

test('lists fees with filters and pagination', async () => {
  const row = { id: 1, ...fee, paid_date: null, record_status: 'active' };
  mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({ rows: [row] });
  const response = await request(app).get('/?student_id=5&status=pending&page=1&limit=10').set('Authorization', `Bearer ${token('faculty')}`);
  expect(response.status).toBe(200);
  expect(response.body.fees[0].fee_type).toBe('tuition');
  expect(response.body.pagination.total).toBe(1);
});
