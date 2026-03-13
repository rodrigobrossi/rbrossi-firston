'use strict';
require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const jwt         = require('jsonwebtoken');
const bcrypt      = require('bcryptjs');
const { v4: uuid} = require('uuid');
const axios       = require('axios');
const mysql       = require('mysql2/promise');
const Redis       = require('ioredis');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── DB + Cache ────────────────────────────────────────────────
const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, waitForConnections: true,
  connectionLimit: 10, charset: 'utf8mb4',
});
const redis = new Redis(process.env.REDIS_URL);

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10kb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many attempts. Try again in 15 minutes.' }
});

// ── Helpers ───────────────────────────────────────────────────
function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET + '_refresh', { expiresIn: process.env.REFRESH_EXPIRES_IN || '7d' });
}
async function storeRefreshToken(userId, token) {
  const key = `refresh:${userId}:${token.slice(-12)}`;
  await redis.set(key, '1', 'EX', 7 * 24 * 60 * 60); // 7 days
}
async function revokeRefreshToken(userId, token) {
  const key = `refresh:${userId}:${token.slice(-12)}`;
  await redis.del(key);
}
async function isRefreshTokenValid(userId, token) {
  const key = `refresh:${userId}:${token.slice(-12)}`;
  return !!(await redis.get(key));
}

async function upsertUser({ provider, oauthId, email, name }) {
  const emailHash = require('crypto').createHash('sha256').update(email.toLowerCase()).digest('hex');
  const [rows] = await db.execute(
    'SELECT id, email_enc, name, plan_id, active FROM users WHERE oauth_provider=? AND oauth_id=?',
    [provider, oauthId]
  );
  if (rows.length) {
    await db.execute('UPDATE users SET updated_at=NOW() WHERE id=?', [rows[0].id]);
    return rows[0];
  }
  // New user
  const id = uuid();
  await db.execute(
    `INSERT INTO users (id, email_hash, email_enc, name, oauth_provider, oauth_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, emailHash, email, name, provider, oauthId]
  );
  // Create default subscription (trial)
  await db.execute(
    'INSERT INTO subscriptions (id, user_id, status) VALUES (?, ?, ?)',
    [uuid(), id, 'trialing']
  );
  return { id, name, email_enc: email, plan_id: 'pro', active: 1 };
}

function issueTokens(user) {
  const payload = { sub: user.id, name: user.name, plan: user.plan_id };
  const accessToken  = signAccess(payload);
  const refreshToken = signRefresh(payload);
  return { accessToken, refreshToken, user: payload };
}

// ── Routes ───────────────────────────────────────────────────

app.get('/health', (req, res) =>
  res.json({ service: 'auth-service', status: 'ok', ts: new Date().toISOString() }));

// ── Google OAuth2 ────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env' });
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.API_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', loginLimiter, async (req, res) => {
  try {
    const { code } = req.query;
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code, client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.API_URL}/auth/google/callback`,
      grant_type: 'authorization_code',
    });
    // Get user profile
    const profile = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });
    const { sub, email, name } = profile.data;
    const user = await upsertUser({ provider: 'google', oauthId: sub, email, name });
    const { accessToken, refreshToken } = issueTokens(user);
    await storeRefreshToken(user.id, refreshToken);
    // Redirect to frontend with tokens in query (frontend stores in memory)
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?access=${accessToken}&refresh=${refreshToken}`);
  } catch (err) {
    console.error('[auth] Google callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?msg=google_failed`);
  }
});

// ── Microsoft OAuth2 ─────────────────────────────────────────
app.get('/auth/microsoft', (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return res.status(503).json({ error: 'Microsoft OAuth not configured.' });
  }
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${process.env.API_URL}/auth/microsoft/callback`,
    scope: 'openid email profile',
    response_mode: 'query',
  });
  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});

app.get('/auth/microsoft/callback', loginLimiter, async (req, res) => {
  try {
    const { code } = req.query;
    const tokenRes = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        code, client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: `${process.env.API_URL}/auth/microsoft/callback`,
        grant_type: 'authorization_code',
      })
    );
    const profile = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });
    const { id, mail, displayName } = profile.data;
    const user = await upsertUser({ provider: 'microsoft', oauthId: id, email: mail, name: displayName });
    const { accessToken, refreshToken } = issueTokens(user);
    await storeRefreshToken(user.id, refreshToken);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?access=${accessToken}&refresh=${refreshToken}`);
  } catch (err) {
    console.error('[auth] Microsoft callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?msg=microsoft_failed`);
  }
});

// ── Dev-only: local login (no OAuth needed for local testing) ─
app.post('/auth/dev-login', loginLimiter, async (req, res) => {
  if (process.env.NODE_ENV !== 'development') return res.status(404).end();
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const user = await upsertUser({
      provider: 'email', oauthId: email,
      email, name: name || email.split('@')[0]
    });
    const { accessToken, refreshToken, user: u } = issueTokens(user);
    await storeRefreshToken(user.id, refreshToken);
    res.json({ accessToken, refreshToken, user: u });
  } catch (err) {
    console.error('[auth] dev-login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Refresh token ─────────────────────────────────────────────
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh');
    const valid = await isRefreshTokenValid(payload.sub, refreshToken);
    if (!valid) return res.status(401).json({ error: 'Refresh token expired or revoked' });
    // Rotate: revoke old, issue new
    await revokeRefreshToken(payload.sub, refreshToken);
    const newAccess  = signAccess({ sub: payload.sub, name: payload.name, plan: payload.plan });
    const newRefresh = signRefresh({ sub: payload.sub, name: payload.name, plan: payload.plan });
    await storeRefreshToken(payload.sub, newRefresh);
    res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── Logout ────────────────────────────────────────────────────
app.post('/auth/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh');
      await revokeRefreshToken(payload.sub, refreshToken);
    } catch (_) {}
  }
  res.json({ message: 'Logged out' });
});

// ── Verify token (used by other services via internal call) ───
app.post('/auth/verify', async (req, res) => {
  const { token } = req.body;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, payload });
  } catch (err) {
    res.status(401).json({ valid: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[auth-service] ✓ listening on :${PORT}`);
  console.log(`  → Dev login: POST http://localhost:${PORT}/auth/dev-login`);
  console.log(`  → Google:    GET  http://localhost:8080/auth/google`);
});
