'use strict';
require('dotenv').config();
const express   = require('express');
const mysql     = require('mysql2/promise');
const crypto    = require('crypto');
const { v4: uuid } = require('uuid');
const cors      = require('cors');
const helmet    = require('helmet');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(helmet()); app.use(cors()); app.use(express.json({ limit: '5mb' }));

// ── DB ────────────────────────────────────────────────────────
const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 10, charset: 'utf8mb4',
});

// ── PII Encryption (AES-256-GCM) ─────────────────────────────
// Local: key from env. Prod: AWS KMS Data Key cached in memory.
const ENC_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encrypt(text) {
  if (!text) return null;
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  if (!b64) return null;
  const buf  = Buffer.from(b64, 'base64');
  const iv   = buf.slice(0, 12);
  const tag  = buf.slice(12, 28);
  const enc  = buf.slice(28);
  const dec  = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  dec.setAuthTag(tag);
  return dec.update(enc) + dec.final('utf8');
}
function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// ── Profile Score ─────────────────────────────────────────────
function calcScore(c) {
  let s = 0;
  if (c.first_name)       s += 10;
  if (c.last_name)        s += 10;
  if (c.email_enc)        s += 15;
  if (c.phone_enc)        s += 15;
  if (c.company_id)       s += 10;
  if (c.title)            s += 5;
  if (c.linkedin_url)     s += 5;
  if (c.sector)           s += 5;
  if (c.budget_brl)       s += 10;
  if (c.buy_cycle_days)   s += 5;
  if (c.preferred_channel)s += 5;
  if (c.tags && c.tags.length > 0) s += 5;
  return Math.min(100, s);
}

function decryptContact(row) {
  if (!row) return null;
  return {
    ...row,
    email: decrypt(row.email_enc),
    phone: decrypt(row.phone_enc),
    cpf:   decrypt(row.cpf_enc),
    tags:  row.tags ? JSON.parse(row.tags) : [],
    email_enc: undefined, phone_enc: undefined, cpf_enc: undefined,
  };
}

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ service: 'contact-service', status: 'ok' }));

// ── GET /contacts ─────────────────────────────────────────────
app.get('/contacts', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id header required' });
  const { temperature, stage, q, limit = 50, offset = 0 } = req.query;
  try {
    let sql = `SELECT c.*, co.name AS company_name
               FROM contacts c LEFT JOIN companies co ON c.company_id = co.id
               WHERE c.owner_id = ? AND c.deleted_at IS NULL`;
    const params = [ownerId];
    if (temperature) { sql += ' AND c.temperature = ?'; params.push(temperature); }
    sql += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const [rows] = await db.execute(sql, params);
    res.json({ data: rows.map(decryptContact), total: rows.length });
  } catch (err) {
    console.error('[contact] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /contacts ────────────────────────────────────────────
app.post('/contacts', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id header required' });
  const { first_name, last_name, email, phone, cpf, company_id, title,
          linkedin_url, sector, budget_brl, buy_cycle_days,
          preferred_channel, tags, source, temperature } = req.body;
  if (!first_name) return res.status(400).json({ error: 'first_name required' });
  const id = uuid();
  const raw = {
    email_enc: encrypt(email), phone_enc: encrypt(phone), cpf_enc: encrypt(cpf),
    company_id, title, linkedin_url, sector, budget_brl, buy_cycle_days,
    preferred_channel, tags, temperature: temperature || 'cold',
  };
  raw.profile_score = calcScore({ first_name, last_name, ...raw });
  try {
    await db.execute(
      `INSERT INTO contacts
       (id, owner_id, first_name, last_name, email_hash, email_enc, phone_enc, cpf_enc,
        company_id, title, linkedin_url, sector, budget_brl, buy_cycle_days,
        preferred_channel, tags, source, temperature, profile_score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ownerId, first_name, last_name || null,
       email ? hashEmail(email) : null,
       raw.email_enc, raw.phone_enc, raw.cpf_enc,
       company_id || null, title || null, linkedin_url || null,
       sector || null, budget_brl || null, buy_cycle_days || null,
       preferred_channel || 'whatsapp',
       tags ? JSON.stringify(tags) : null,
       source || 'manual', raw.temperature, raw.profile_score]
    );
    res.status(201).json({ id, profile_score: raw.profile_score });
  } catch (err) {
    console.error('[contact] create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /contacts/:id ─────────────────────────────────────────
app.get('/contacts/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const [rows] = await db.execute(
    'SELECT * FROM contacts WHERE id=? AND owner_id=? AND deleted_at IS NULL', [req.params.id, ownerId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(decryptContact(rows[0]));
});

// ── PATCH /contacts/:id ───────────────────────────────────────
app.patch('/contacts/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const updates = req.body;
  const allowed = ['first_name','last_name','title','linkedin_url','sector',
    'budget_brl','buy_cycle_days','preferred_channel','tags','temperature','company_id'];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (updates[k] !== undefined) {
      sets.push(`${k}=?`);
      params.push(k === 'tags' ? JSON.stringify(updates[k]) : updates[k]);
    }
  }
  if (updates.email) { sets.push('email_enc=?','email_hash=?'); params.push(encrypt(updates.email), hashEmail(updates.email)); }
  if (updates.phone) { sets.push('phone_enc=?'); params.push(encrypt(updates.phone)); }
  if (!sets.length)  return res.status(400).json({ error: 'Nothing to update' });
  sets.push('updated_at=NOW()');
  params.push(req.params.id, ownerId);
  await db.execute(`UPDATE contacts SET ${sets.join(',')} WHERE id=? AND owner_id=?`, params);
  res.json({ updated: true });
});

// ── DELETE /contacts/:id (soft) ───────────────────────────────
app.delete('/contacts/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  await db.execute(
    'UPDATE contacts SET deleted_at=NOW() WHERE id=? AND owner_id=?', [req.params.id, ownerId]
  );
  res.json({ deleted: true });
});

// ── POST /contacts/import — CSV bulk import ────────────────────
app.post('/contacts/import', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { rows } = req.body; // [{ first_name, last_name, email, phone, ... }]
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows array required' });
  let imported = 0, skipped = 0;
  for (const r of rows.slice(0, 1000)) { // max 1000 per batch
    if (!r.first_name && !r.email) { skipped++; continue; }
    try {
      const id = uuid();
      const score = calcScore(r);
      await db.execute(
        `INSERT IGNORE INTO contacts
         (id, owner_id, first_name, last_name, email_hash, email_enc, phone_enc,
          source, temperature, profile_score)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, ownerId, r.first_name || r.email?.split('@')[0], r.last_name || null,
         r.email ? hashEmail(r.email) : null,
         encrypt(r.email), encrypt(r.phone),
         'csv', 'cold', score]
      );
      imported++;
    } catch (_) { skipped++; }
  }
  res.json({ imported, skipped });
});

app.listen(PORT, () => console.log(`[contact-service] ✓ listening on :${PORT}`));
