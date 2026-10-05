require('dotenv').config();

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = Number(process.env.PORT) || 8080;
const authServiceUrl = process.env.AUTH_SERVICE_URL;
const studentServiceUrl = process.env.STUDENT_SERVICE_URL;
const courseServiceUrl = process.env.COURSE_SERVICE_URL;
const attendanceServiceUrl = process.env.ATTENDANCE_SERVICE_URL;
const facultyServiceUrl = process.env.FACULTY_SERVICE_URL;
const feesServiceUrl = process.env.FEES_SERVICE_URL;

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

if (!authServiceUrl) {
  console.error('AUTH_SERVICE_URL is not configured');
  app.use('/auth', (req, res) => res.status(500).json({ message: 'Auth proxy is not configured' }));
} else {
  app.use('/auth', createProxyMiddleware({
    target: authServiceUrl,
    changeOrigin: true,
    pathRewrite: { '^/auth': '' }
  }));
}

function addServiceProxy(path, target, name) {
  if (!target) {
    console.error(`${name} is not configured`);
    app.use(path, (req, res) => res.status(500).json({ message: `${name.replace('_URL', '')} proxy is not configured` }));
    return;
  }
  app.use(path, createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { [`^${path}`]: '' }
  }));
}

addServiceProxy('/students', studentServiceUrl, 'STUDENT_SERVICE_URL');
addServiceProxy('/courses', courseServiceUrl, 'COURSE_SERVICE_URL');
addServiceProxy('/attendance', attendanceServiceUrl, 'ATTENDANCE_SERVICE_URL');
addServiceProxy('/faculty', facultyServiceUrl, 'FACULTY_SERVICE_URL');
addServiceProxy('/fees', feesServiceUrl, 'FEES_SERVICE_URL');

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

app.listen(port, () => {
  console.log(`API gateway listening on port ${port}`);
});
