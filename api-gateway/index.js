require('dotenv').config();

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const port = Number(process.env.PORT) || 8080;
const authServiceUrl = process.env.AUTH_SERVICE_URL;

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

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

app.listen(port, () => {
  console.log(`API gateway listening on port ${port}`);
});
