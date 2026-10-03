const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const course = { course_code: 'CS101', title: 'Introduction to Computing', credits: 3 };

beforeEach(() => mockQuery.mockReset());

test('requires a valid token for course routes', async () => {
  const missing = await request(app).get('/');
  const invalid = await request(app).get('/').set('Authorization', 'Bearer bad-token');
  expect(missing.status).toBe(401);
  expect(invalid.status).toBe(401);
});

test('allows reads for any authenticated role and rejects writes without admin', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
  expect((await request(app).get('/').set('Authorization', `Bearer ${token('employee')}`)).status).toBe(200);
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('employee')}`).send(course)).status).toBe(403);
});

test('validates create input', async () => {
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send({ ...course, credits: 7 });
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('message');
});

test('creates, reads, updates, and soft deletes a course', async () => {
  const row = { id: 1, ...course, status: 'active' };
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(course)).status).toBe(201);
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).get('/1').set('Authorization', `Bearer ${token('employee')}`)).body.course.id).toBe(1);
  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, title: 'Computing' }] });
  expect((await request(app).put('/1').set('Authorization', `Bearer ${token('admin')}`).send({ title: 'Computing' })).body.course.title).toBe('Computing');
  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, status: 'archived' }] });
  expect((await request(app).delete('/1').set('Authorization', `Bearer ${token('admin')}`)).body.course.status).toBe('archived');
});

test('returns 409 when the course code conflicts', async () => {
  mockQuery.mockRejectedValueOnce({ code: '23505' });
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(course);
  expect(response.status).toBe(409);
});
