const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const attendance = { student_id: 12, date: '2026-10-04', status: 'present', remarks: 'On time' };

beforeEach(() => mockQuery.mockReset());

test('requires a valid token for attendance routes', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const health = await request(app).get('/health');
  const missing = await request(app).get('/');
  const invalid = await request(app).get('/').set('Authorization', 'Bearer bad-token');
  expect(health.status).toBe(200);
  expect(missing.status).toBe(401);
  expect(invalid.status).toBe(401);
});

test('allows reads for any authenticated role and limits writes to admin or faculty', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
  expect((await request(app).get('/').set('Authorization', `Bearer ${token('student')}`)).status).toBe(200);
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('student')}`).send(attendance)).status).toBe(403);
});

test('validates attendance create input', async () => {
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send({ ...attendance, status: 'tardy' });
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('message');
  expect(mockQuery).not.toHaveBeenCalled();
});

test('creates, lists with filters, reads, updates, and soft deletes an attendance record', async () => {
  const row = { id: 1, ...attendance, record_status: 'active' };
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('faculty')}`).send(attendance)).status).toBe(201);

  mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({ rows: [row] });
  const listed = await request(app).get('/?student_id=12&date=2026-10-04&status=present&page=1&limit=5').set('Authorization', `Bearer ${token('student')}`);
  expect(listed.status).toBe(200);
  expect(listed.body.attendances).toHaveLength(1);

  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).get('/1').set('Authorization', `Bearer ${token('student')}`)).body.attendance.id).toBe(1);

  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, status: 'leave' }] });
  expect((await request(app).put('/1').set('Authorization', `Bearer ${token('admin')}`).send({ status: 'leave' })).body.attendance.status).toBe('leave');

  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, record_status: 'archived' }] });
  expect((await request(app).delete('/1').set('Authorization', `Bearer ${token('faculty')}`)).body.attendance.record_status).toBe('archived');
  expect(mockQuery.mock.calls[5][0]).toContain("record_status = 'archived'");
});

test('returns a message when attendance storage fails', async () => {
  mockQuery.mockRejectedValueOnce(new Error('database unavailable'));
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(attendance);
  expect(response.status).toBe(500);
  expect(response.body).toHaveProperty('message');
});