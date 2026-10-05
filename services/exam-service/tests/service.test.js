const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

process.env.JWT_SECRET = 'test-secret';
const token = role => jwt.sign({ id: 1, email: 'test@example.com', role }, process.env.JWT_SECRET);
const exam = {
  exam_name: 'Midterm Assessment',
  course_code: 'MATH101',
  exam_date: '2026-10-15',
  max_marks: 100,
  record_status: 'active'
};
const result = {
  exam_id: 1,
  student_id: 7,
  marks_obtained: 88,
  grade: 'A',
  record_status: 'active'
};

beforeEach(() => mockQuery.mockReset());

test('requires a valid token for exam routes', async () => {
  const missing = await request(app).get('/');
  const invalid = await request(app).get('/').set('Authorization', 'Bearer bad-token');
  expect(missing.status).toBe(401);
  expect(invalid.status).toBe(401);
});

test('rejects non-admin and non-faculty roles for protected writes', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] }).mockResolvedValueOnce({ rows: [] });
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('employee')}`).send(exam);
  expect(response.status).toBe(403);
});

test('creates an exam with an admin or faculty token', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, ...exam }] });
  const response = await request(app).post('/').set('Authorization', `Bearer ${token('admin')}`).send(exam);
  expect(response.status).toBe(201);
  expect(response.body.exam).toMatchObject({ exam_name: exam.exam_name, course_code: exam.course_code });
});

test('lists exams and result data for authenticated users', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ total: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...exam }] })
    .mockResolvedValueOnce({ rows: [{ total: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...result }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...exam }] });

  const examList = await request(app).get('/').set('Authorization', `Bearer ${token('student')}`);
  expect(examList.status).toBe(200);
  expect(examList.body.exams).toHaveLength(1);

  const resultList = await request(app).get('/results').set('Authorization', `Bearer ${token('student')}`);
  expect(resultList.status).toBe(200);
  expect(resultList.body.results).toHaveLength(1);

  const examLookup = await request(app).get('/1').set('Authorization', `Bearer ${token('faculty')}`);
  expect(examLookup.status).toBe(200);
});

test('updates and soft deletes exams and results', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: 1, ...exam, exam_name: 'Updated Midterm' }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...exam, exam_name: 'Updated Midterm', record_status: 'archived' }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...result, grade: 'A+' }] })
    .mockResolvedValueOnce({ rows: [{ max_marks: 100 }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...result, grade: 'A+' }] })
    .mockResolvedValueOnce({ rows: [{ id: 1, ...result, grade: 'A+', record_status: 'archived' }] });

  const examUpdate = await request(app).put('/1').set('Authorization', `Bearer ${token('faculty')}`).send({ exam_name: 'Updated Midterm' });
  expect(examUpdate.status).toBe(200);
  expect(examUpdate.body.exam.exam_name).toBe('Updated Midterm');

  const examDelete = await request(app).delete('/1').set('Authorization', `Bearer ${token('admin')}`);
  expect(examDelete.status).toBe(200);
  expect(examDelete.body.exam.record_status).toBe('archived');

  const resultUpdate = await request(app).put('/results/1').set('Authorization', `Bearer ${token('faculty')}`).send({ grade: 'A+' });
  expect(resultUpdate.status).toBe(200);
  expect(resultUpdate.body.result.grade).toBe('A+');

  const resultDelete = await request(app).delete('/results/1').set('Authorization', `Bearer ${token('admin')}`);
  expect(resultDelete.status).toBe(200);
  expect(resultDelete.body.result.record_status).toBe('archived');
});
