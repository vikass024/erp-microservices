const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 42, email: 'user@example.com', role }, process.env.JWT_SECRET);

beforeEach(() => mockQuery.mockReset());

test('health route is public', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('ok');
});

test('requires a valid token for protected routes', async () => {
  const missing = await request(app).get('/');
  const invalid = await request(app).get('/').set('Authorization', 'Bearer bad-token');
  expect(missing.status).toBe(401);
  expect(invalid.status).toBe(401);
});

test('allows reads for authenticated users and rejects writes without admin or faculty', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const listResponse = await request(app).get('/').set('Authorization', `Bearer ${token('student')}`);
  expect(listResponse.status).toBe(200);

  const createResponse = await request(app)
    .post('/')
    .set('Authorization', `Bearer ${token('student')}`)
    .send({ title: 'Test', message: 'Hello' });

  expect(createResponse.status).toBe(403);
});

test('validates create payload and creates a notification', async () => {
  const invalid = await request(app)
    .post('/')
    .set('Authorization', `Bearer ${token('admin')}`)
    .send({ title: '', message: '' });
  expect(invalid.status).toBe(400);

  const row = {
    id: 1,
    title: 'Welcome',
    message: 'Hello students',
    target_role: 'student',
    created_by: 42,
    created_at: '2026-10-05T00:00:00.000Z'
  };

  mockQuery.mockResolvedValueOnce({ rows: [row] });

  const response = await request(app)
    .post('/')
    .set('Authorization', `Bearer ${token('admin')}`)
    .send({ title: 'Welcome', message: 'Hello students', target_role: 'student' });

  expect(response.status).toBe(201);
  expect(response.body.notification.title).toBe('Welcome');
});

test('lists, fetches, and deletes notifications', async () => {
  const row = {
    id: 1,
    title: 'Reminder',
    message: 'Faculty meeting at 10am',
    target_role: 'faculty',
    created_by: 42,
    created_at: '2026-10-05T00:00:00.000Z'
  };

  mockQuery.mockResolvedValueOnce({ rows: [row] });
  const listResponse = await request(app)
    .get('/?target_role=faculty')
    .set('Authorization', `Bearer ${token('faculty')}`);
  expect(listResponse.status).toBe(200);
  expect(listResponse.body.notifications[0].target_role).toBe('faculty');

  mockQuery.mockResolvedValueOnce({ rows: [row] });
  const getResponse = await request(app).get('/1').set('Authorization', `Bearer ${token('student')}`);
  expect(getResponse.status).toBe(200);
  expect(getResponse.body.notification.id).toBe(1);

  mockQuery.mockResolvedValueOnce({ rows: [row] });
  const deleteResponse = await request(app).delete('/1').set('Authorization', `Bearer ${token('faculty')}`);
  expect(deleteResponse.status).toBe(200);
  expect(deleteResponse.body.notification.id).toBe(1);
});
