const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
const app = require('../index');
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const headers = role => ({ Authorization: `Bearer ${token(role)}` });
const faculty = {
  name: 'Ada Lovelace',
  employee_code: 'F001',
  department: 'Computing',
  designation: 'Professor',
  email: 'ada@example.com',
  phone: '+1-555-0100'
};

beforeEach(() => mockQuery.mockReset());

test('health is public and protected routes require a valid token', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  expect((await request(app).get('/health')).status).toBe(200);
  expect((await request(app).get('/')).status).toBe(401);
  expect((await request(app).get('/').set('Authorization', 'Bearer invalid')).status).toBe(401);
});

test('only admins can create, update, or delete faculty', async () => {
  expect((await request(app).post('/').set(headers('employee')).send(faculty)).status).toBe(403);
  expect((await request(app).put('/1').set(headers('employee')).send({ name: 'Augusta' })).status).toBe(403);
  expect((await request(app).delete('/1').set(headers('employee'))).status).toBe(403);
  expect(mockQuery).not.toHaveBeenCalled();
});

test('validates create and update input', async () => {
  const create = await request(app).post('/').set(headers('admin')).send({ ...faculty, email: 'invalid' });
  const update = await request(app).put('/1').set(headers('admin')).send({ unexpected: true });
  expect(create.status).toBe(400);
  expect(create.body).toHaveProperty('message');
  expect(update.status).toBe(400);
  expect(mockQuery).not.toHaveBeenCalled();
});

test('creates, lists by department with pagination, reads, updates, and archives faculty', async () => {
  const row = { id: 1, ...faculty, record_status: 'active', created_at: '2026-01-01T00:00:00.000Z' };
  mockQuery.mockResolvedValueOnce({ rows: [row] });
  const created = await request(app).post('/').set(headers('admin')).send(faculty);
  expect(created.status).toBe(201);
  expect(created.body.faculty.record_status).toBe('active');

  mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({ rows: [row] });
  const listed = await request(app).get('/?department=Computing&page=2&limit=5').set(headers('employee'));
  expect(listed.status).toBe(200);
  expect(listed.body.faculties).toHaveLength(1);
  expect(listed.body.pagination).toEqual({ page: 2, limit: 5, total: 1, pages: 1 });
  expect(mockQuery.mock.calls[1][0]).toContain('department = $1');
  expect(mockQuery.mock.calls[1][1]).toEqual(['Computing']);

  mockQuery.mockResolvedValueOnce({ rows: [row] });
  expect((await request(app).get('/1').set(headers('employee'))).body.faculty.id).toBe(1);

  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, designation: 'Chair' }] });
  expect((await request(app).put('/1').set(headers('admin')).send({ designation: 'Chair' })).body.faculty.designation).toBe('Chair');

  mockQuery.mockResolvedValueOnce({ rows: [{ ...row, record_status: 'archived' }] });
  const archived = await request(app).delete('/1').set(headers('admin'));
  expect(archived.body.faculty.record_status).toBe('archived');
  expect(mockQuery.mock.calls[5][0]).toContain("record_status = 'archived'");
});

test('validates pagination and ids, and reports unique conflicts', async () => {
  expect((await request(app).get('/?limit=101').set(headers('employee'))).status).toBe(400);
  expect((await request(app).get('/0').set(headers('employee'))).status).toBe(400);
  mockQuery.mockRejectedValueOnce({ code: '23505' });
  const conflict = await request(app).post('/').set(headers('admin')).send(faculty);
  expect(conflict.status).toBe(409);
  expect(conflict.body).toHaveProperty('message');
});
