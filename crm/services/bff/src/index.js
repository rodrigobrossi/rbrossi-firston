'use strict';
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const morgan     = require('morgan');
const jwt        = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const cb         = require('./circuitBreaker');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Service URLs (injected via docker-compose env) ────────────
const SVC = {
  auth:         process.env.AUTH_SERVICE_URL         || 'http://auth:3001',
  contact:      process.env.CONTACT_SERVICE_URL       || 'http://contact:3002',
  calendar:     process.env.CALENDAR_SERVICE_URL      || 'http://calendar:3003',
  pipeline:     process.env.PIPELINE_SERVICE_URL      || 'http://pipeline:3004',
  contract:     process.env.CONTRACT_SERVICE_URL      || 'http://contract:3005',
  messaging:    process.env.MESSAGING_SERVICE_URL     || 'http://messaging:3006',
  sentiment:    process.env.SENTIMENT_SERVICE_URL     || 'http://sentiment:3007',
  billing:      process.env.BILLING_SERVICE_URL       || 'http://billing:3008',
  notification: process.env.NOTIFICATION_SERVICE_URL  || 'http://notification:3009',
};

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 30,
  message: { error: 'Too many auth attempts' } });
const apiLimiter  = rateLimit({ windowMs: 60*1000, max: 200,
  message: { error: 'Too many requests' }, skip: r => r.path === '/health' });

app.use('/auth', authLimiter);
app.use('/api',  apiLimiter);

// ── JWT middleware ────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = req.user.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Proxy helper: forward request through circuit breaker ─────
async function proxy(serviceName, req, res, {
  method, path, body, fallback = null, headers = {}
} = {}) {
  const url    = `${SVC[serviceName]}${path || req.path}`;
  const config = {
    method:  method || req.method,
    url,
    data:    body !== undefined ? body : req.body,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id':    req.userId || '',
      'x-request-id': uuid(),
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      ...headers,
    },
    params:  req.query,
  };
  try {
    const data = await cb.call(serviceName, config, fallback);
    if (data?.circuit_open) return res.status(503).json(data);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const msg    = err.response?.data   || { error: err.message };
    res.status(status).json(msg);
  }
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

// ── Health ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    service:  'bff',
    status:   'ok',
    ts:        new Date().toISOString(),
    circuit_breakers: cb.getStats(),
  });
});

// ── Auth (public — no JWT required) ──────────────────────────
app.post('/auth/dev-login',    (req, res) => proxy('auth', req, res));
app.post('/auth/refresh',      (req, res) => proxy('auth', req, res));
app.post('/auth/logout',       (req, res) => proxy('auth', req, res));
app.get('/auth/google',        (req, res) => proxy('auth', req, res));
app.get('/auth/google/callback', (req, res) => proxy('auth', req, res));
app.get('/auth/microsoft',     (req, res) => proxy('auth', req, res));
app.get('/auth/microsoft/callback', (req, res) => proxy('auth', req, res));

// ── All API routes require auth ───────────────────────────────
app.use('/api', requireAuth);

// ── Contacts ──────────────────────────────────────────────────
app.get('/api/contacts',         (req, res) => proxy('contact', req, res, { path: '/contacts' }));
app.post('/api/contacts',        (req, res) => proxy('contact', req, res, { path: '/contacts' }));
app.post('/api/contacts/import', (req, res) => proxy('contact', req, res, { path: '/contacts/import' }));
app.get('/api/contacts/:id',     (req, res) => proxy('contact', req, res, { path: `/contacts/${req.params.id}` }));
app.patch('/api/contacts/:id',   (req, res) => proxy('contact', req, res, { path: `/contacts/${req.params.id}` }));
app.delete('/api/contacts/:id',  (req, res) => proxy('contact', req, res, { path: `/contacts/${req.params.id}` }));

// ── Calendar ──────────────────────────────────────────────────
app.get('/api/events',          (req, res) => proxy('calendar', req, res, { path: '/events' }));
app.post('/api/events',         (req, res) => proxy('calendar', req, res, { path: '/events' }));
app.patch('/api/events/:id',    (req, res) => proxy('calendar', req, res, { path: `/events/${req.params.id}` }));
app.delete('/api/events/:id',   (req, res) => proxy('calendar', req, res, { path: `/events/${req.params.id}` }));

// ── Pipeline ──────────────────────────────────────────────────
app.get('/api/opportunities',         (req, res) => proxy('pipeline', req, res, { path: '/opportunities' }));
app.get('/api/opportunities/stats',   (req, res) => proxy('pipeline', req, res, { path: '/opportunities/stats' }));
app.post('/api/opportunities',        (req, res) => proxy('pipeline', req, res, { path: '/opportunities' }));
app.patch('/api/opportunities/:id',   (req, res) => proxy('pipeline', req, res, { path: `/opportunities/${req.params.id}` }));

// ── Contracts ─────────────────────────────────────────────────
app.get('/api/contracts',             (req, res) => proxy('contract', req, res, { path: '/contracts' }));
app.post('/api/contracts',            (req, res) => proxy('contract', req, res, { path: '/contracts' }));
app.patch('/api/contracts/:id',       (req, res) => proxy('contract', req, res, { path: `/contracts/${req.params.id}` }));
app.get('/api/contracts/templates',   (req, res) => proxy('contract', req, res, { path: '/contracts/templates' }));
app.post('/api/contracts/templates',  (req, res) => proxy('contract', req, res, { path: '/contracts/templates' }));

// ── Messaging ─────────────────────────────────────────────────
app.get('/api/conversations',              (req, res) => proxy('messaging', req, res, { path: '/conversations' }));
app.get('/api/conversations/:id/messages', (req, res) => proxy('messaging', req, res, { path: `/conversations/${req.params.id}/messages` }));
app.post('/api/messages',                  (req, res) => proxy('messaging', req, res, { path: '/messages' }));

// ── Sentiment ─────────────────────────────────────────────────
app.post('/api/sentiment/analyze',       (req, res) => proxy('sentiment', req, res, { path: '/sentiment/analyze', fallback: { stress_score: 0, level: 'calm' } }));
app.post('/api/sentiment/conversation',  (req, res) => proxy('sentiment', req, res, { path: '/sentiment/conversation', fallback: { avg_stress: 0 } }));

// ── Billing ───────────────────────────────────────────────────
app.post('/api/billing/charge',              (req, res) => proxy('billing', req, res, { path: '/billing/charge' }));
app.get('/api/billing/subscription/:userId', (req, res) => proxy('billing', req, res, { path: `/billing/subscription/${req.params.userId}` }));
app.post('/webhooks/pix',                    (req, res) => proxy('billing', req, res, { path: '/webhooks/pix' }));
app.post('/webhooks/whatsapp',               (req, res) => proxy('messaging', req, res, { path: '/webhooks/whatsapp' }));

// ── Dashboard aggregate ───────────────────────────────────────
// Single BFF call returns everything the dashboard needs (avoids waterfall)
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const headers = {
    'x-user-id': req.userId,
    Authorization: req.headers.authorization,
    'Content-Type': 'application/json',
    'x-request-id': uuid(),
  };
  const [contacts, pipelineStats, events] = await Promise.allSettled([
    cb.call('contact', { method:'GET', url:`${SVC.contact}/contacts?limit=5`, headers }, { data:[], total:0 }),
    cb.call('pipeline', { method:'GET', url:`${SVC.pipeline}/opportunities/stats`, headers }, { by_stage:[], weighted_pipeline:0 }),
    cb.call('calendar', { method:'GET', url:`${SVC.calendar}/events?start=${new Date().toISOString()}&end=${new Date(Date.now()+7*86400000).toISOString()}`, headers }, { data:[] }),
  ]);

  res.json({
    contacts:       contacts.value      ?? { data:[], total:0 },
    pipeline_stats: pipelineStats.value ?? { by_stage:[], weighted_pipeline:0 },
    upcoming_events:events.value        ?? { data:[] },
    _meta: { fetched_at: new Date().toISOString(), aggregated: true },
  });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[bff] ✓ Backend for Frontend on :${PORT}`);
  console.log(`  → All client traffic routes through http://localhost:${PORT}`);
  console.log(`  → Circuit breaker dashboard: GET /health`);
});
