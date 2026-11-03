const request = require('supertest');

process.env.AUTH_SERVICE_URL = 'http://auth.test';
process.env.STUDENT_SERVICE_URL = 'http://student.test';
process.env.COURSE_SERVICE_URL = 'http://course.test';
process.env.ATTENDANCE_SERVICE_URL = 'http://attendance.test';
process.env.FACULTY_SERVICE_URL = 'http://faculty.test';
process.env.EXAM_SERVICE_URL = 'http://exam.test';
process.env.FEES_SERVICE_URL = 'http://fees.test';
process.env.NOTIFICATION_SERVICE_URL = 'http://notification.test';

const mockProxyOptions = [];
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(options => {
    mockProxyOptions.push(options);
    return (req, res, next) => next();
  })
}));

const app = require('../index');

test('health returns ok', async () => {
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});

test('unknown route returns a 404 JSON response', async () => {
  const response = await request(app).get('/unknown');
  expect(response.status).toBe(404);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toEqual({ message: 'Route not found' });
});

test('auth proxy uses the configured auth service target', () => {
  expect(mockProxyOptions[0].target).toBe('http://auth.test');
});

test('students and courses proxies use their configured service targets', () => {
  expect(mockProxyOptions[1].target).toBe('http://student.test');
  expect(mockProxyOptions[2].target).toBe('http://course.test');
});
