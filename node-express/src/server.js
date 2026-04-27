// Boots the RedirectIQ Express server, middleware stack, and route wiring.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./auth');
const linksRoutes = require('./links');
const statsRoutes = require('./stats');
const createRedirectRouter = require('./redirect');

require('./db');

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';
const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
const benchmarkMode = String(process.env.BENCHMARK_MODE || 'false').toLowerCase() === 'true';

function createLimiter(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    skip: function skipRateLimitForBenchmark() {
      return benchmarkMode;
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: function rateLimitHandler(req, res) {
      res.status(429).json({ error: 'Too many requests' });
    }
  });
}

const authLimiter = createLimiter(15 * 60 * 1000, 20);
const redirectLimiter = createLimiter(60 * 1000, 100);
const apiLimiter = createLimiter(15 * 60 * 1000, 200);

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  function serveFrontendIndex(req, res, next) {
    const indexPath = path.join(frontendPath, 'index.html');

    if (!fs.existsSync(indexPath)) {
      return next();
    }

    return res.sendFile(indexPath);
  }

  app.use('/auth', authLimiter, authRoutes);
  app.use('/links', apiLimiter, linksRoutes);
  app.use('/stats', apiLimiter, statsRoutes);
  app.get('/health', apiLimiter, function health(req, res) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('/', serveFrontendIndex);
    app.get('/login', serveFrontendIndex);
    app.get('/dashboard', serveFrontendIndex);
  }

  app.use('/', createRedirectRouter(redirectLimiter));

  return app;
}

const app = createApp();

function startServer(options = {}) {
  const resolvedPort = Object.prototype.hasOwnProperty.call(options, 'port')
    ? Number(options.port)
    : port;
  const resolvedHost = options.host || host;

  return app.listen(resolvedPort, resolvedHost, function listen() {
    console.log(`RedirectIQ listening on ${resolvedHost}:${resolvedPort}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  createApp,
  startServer
};
