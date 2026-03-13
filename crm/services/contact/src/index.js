'use strict';
require('dotenv').config();
const express   = require('express');
const mysql     = require('mysql2/promise');
const crypto    = require('crypto');
const { v4: uuid } = require('uuid');
const cors      = require('cors');
const helmet    = require('helmet');
const multer    = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app  = express();
const PORT = process.env.PORT || 3002;

const S3_BUCKET_ASSETS   = process.env.S3_BUCKET_ASSETS || 'firston-assets';
// S3_PUBLIC_ENDPOINT: browser-reachable base URL
// dev  → http://localhost:4566   (LocalStack exposed on host)
// prod → leave empty; virtual-hosted S3 URL is used automatically
const S3_PUBLIC_ENDPOINT = (process.env.S3_PUBLIC_ENDPOINT || '').replace(/\/$/, '');

app.use(helmet()); app.use(cors()); app.use(express.json({ limit: '5mb' }));

// ── S3 Client (LocalStack in dev / AWS S3 in prod) ────────────
const s3 = new S3Client({
  region:         process.env.AWS_REGION || 'sa-east-1',
  endpoint:       process.env.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: true,   // LocalStack requires path-style URLs
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

// ── Multer — memory storage, images only, 5 MB ───────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only')),
});

// ── DB ────────────────────────────────────────────────────────
const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 10, charset: 'utf8mb4',
});

// ── PII Encryption (AES-256-GCM) ─────────────────────────────
// Dev: key from env.   Prod: AWS KMS data key cached in memory.
const ENC_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

function encrypt(text) {
  if (!text) return null;
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    // AES-256-GCM payload must be at least 12 (IV) + 16 (tag) + 1 (data) = 29 bytes
    if (buf.length < 29) throw new Error('too short');
    const iv  = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const dec = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    dec.setAuthTag(tag);
    return dec.update(enc) + dec.final('utf8');
  } catch {
    // Legacy plain-text value (pre-encryption migration) — return as-is
    return b64;
  }
}
function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// ── Photo URL ─────────────────────────────────────────────────
function photoUrl(photoKey) {
  if (!photoKey) return null;
  if (S3_PUBLIC_ENDPOINT) return `${S3_PUBLIC_ENDPOINT}/${S3_BUCKET_ASSETS}/${photoKey}`;
  // Real AWS: virtual-hosted style
  const region = process.env.AWS_REGION || 'sa-east-1';
  return `https://${S3_BUCKET_ASSETS}.s3.${region}.amazonaws.com/${photoKey}`;
}

// ── Profile Score ─────────────────────────────────────────────
function calcScore(c) {
  let s = 0;
  if (c.first_name)          s += 10;
  if (c.last_name)           s += 5;
  if (c.email_enc)           s += 15;
  if (c.phone_enc)           s += 10;
  if (c.phone2_enc)          s += 5;
  if (c.date_of_birth_enc)   s += 5;
  if (c.sex)                 s += 3;
  if (c.preferred_name_enc)  s += 5;
  if (c.address_enc)         s += 7;
  if (c.photo_key)           s += 5;
  if (c.company_id)          s += 5;
  if (c.title)               s += 5;
  if (c.linkedin_url)        s += 5;
  if (c.sector)              s += 3;
  if (c.budget_brl)          s += 5;
  if (c.preferred_channel)   s += 2;
  if (c.tags && c.tags.length > 0) s += 5;
  return Math.min(100, s);
}

function decryptContact(row) {
  if (!row) return null;
  return {
    ...row,
    email:          decrypt(row.email_enc),
    phone:          decrypt(row.phone_enc),
    phone2:         decrypt(row.phone2_enc),
    cpf:            decrypt(row.cpf_enc),
    date_of_birth:  decrypt(row.date_of_birth_enc),
    preferred_name: decrypt(row.preferred_name_enc),
    address:        decrypt(row.address_enc),
    photo_url:      photoUrl(row.photo_key),
    // mysql2 auto-parses JSON columns; guard against both parsed and string forms
    tags:           Array.isArray(row.tags) ? row.tags
                    : (() => { try { return row.tags ? JSON.parse(row.tags) : [] } catch { return [] } })(),
    // strip raw encrypted blobs
    email_enc: undefined, phone_enc: undefined, phone2_enc: undefined,
    cpf_enc: undefined, date_of_birth_enc: undefined,
    preferred_name_enc: undefined, address_enc: undefined,
  };
}

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ service: 'contact-service', status: 'ok' }));

// ── GET /contacts ─────────────────────────────────────────────
app.get('/contacts', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id header required' });
  const { temperature, limit = 50, offset = 0 } = req.query;
  try {
    let sql = `SELECT c.*, co.name AS company_name
               FROM contacts c LEFT JOIN companies co ON c.company_id = co.id
               WHERE c.owner_id = ? AND c.deleted_at IS NULL`;
    const params = [ownerId];
    if (temperature) { sql += ' AND c.temperature = ?'; params.push(temperature); }
    sql += ' ORDER BY c.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    // db.query() (text protocol) instead of execute() — MySQL 8 prepared
    // statements reject LIMIT/OFFSET bound params with "Incorrect arguments"
    const [rows] = await db.query(sql, params);
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
  const {
    first_name, last_name, email, phone, phone2, cpf,
    date_of_birth, sex, gender, preferred_name,
    address, address_lat, address_lng,
    company_id, title, linkedin_url, sector,
    budget_brl, buy_cycle_days, preferred_channel, tags, source, temperature,
  } = req.body;
  if (!first_name) return res.status(400).json({ error: 'first_name required' });

  const id  = uuid();
  const raw = {
    email_enc:          encrypt(email),
    phone_enc:          encrypt(phone),
    phone2_enc:         encrypt(phone2),
    cpf_enc:            encrypt(cpf),
    date_of_birth_enc:  encrypt(date_of_birth),
    preferred_name_enc: encrypt(preferred_name),
    address_enc:        encrypt(address),
    sex: sex || null, gender: gender || null,
    company_id, title, linkedin_url, sector, budget_brl, buy_cycle_days,
    preferred_channel, tags, temperature: temperature || 'cold',
  };
  raw.profile_score = calcScore({ first_name, last_name, ...raw });

  try {
    await db.execute(
      `INSERT INTO contacts
       (id, owner_id, first_name, last_name,
        email_hash, email_enc, phone_enc, phone2_enc, cpf_enc,
        date_of_birth_enc, sex, gender, preferred_name_enc,
        address_enc, address_lat, address_lng,
        company_id, title, linkedin_url, sector,
        budget_brl, buy_cycle_days, preferred_channel,
        tags, source, temperature, profile_score)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ownerId, first_name, last_name || null,
       email ? hashEmail(email) : null,
       raw.email_enc, raw.phone_enc, raw.phone2_enc, raw.cpf_enc,
       raw.date_of_birth_enc, raw.sex, raw.gender, raw.preferred_name_enc,
       raw.address_enc, address_lat || null, address_lng || null,
       company_id || null, title || null, linkedin_url || null, sector || null,
       budget_brl || null, buy_cycle_days || null,
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
    'SELECT * FROM contacts WHERE id=? AND owner_id=? AND deleted_at IS NULL',
    [req.params.id, ownerId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(decryptContact(rows[0]));
});

// ── PATCH /contacts/:id ───────────────────────────────────────
app.patch('/contacts/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const updates = req.body;

  const plainFields = [
    'first_name', 'last_name', 'title', 'linkedin_url', 'sector',
    'budget_brl', 'buy_cycle_days', 'preferred_channel', 'tags',
    'temperature', 'company_id', 'sex', 'gender', 'address_lat', 'address_lng',
  ];
  const encryptedFields = {
    email:          'email_enc',
    phone:          'phone_enc',
    phone2:         'phone2_enc',
    cpf:            'cpf_enc',
    date_of_birth:  'date_of_birth_enc',
    preferred_name: 'preferred_name_enc',
    address:        'address_enc',
  };

  const sets = []; const params = [];
  // ENUM columns — treat empty string as NULL
  const enumFields = new Set(['sex', 'temperature', 'preferred_channel']);
  for (const k of plainFields) {
    if (updates[k] !== undefined) {
      sets.push(`${k}=?`);
      let val = updates[k];
      if (k === 'tags') val = JSON.stringify(val);
      else if (enumFields.has(k) && val === '') val = null;
      params.push(val);
    }
  }
  for (const [plainKey, encCol] of Object.entries(encryptedFields)) {
    if (updates[plainKey] !== undefined) {
      sets.push(`${encCol}=?`);
      params.push(encrypt(updates[plainKey]));
      if (plainKey === 'email') {
        sets.push('email_hash=?');
        params.push(updates.email ? hashEmail(updates.email) : null);
      }
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push('updated_at=NOW()');
  params.push(req.params.id, ownerId);
  await db.execute(`UPDATE contacts SET ${sets.join(',')} WHERE id=? AND owner_id=?`, params);
  res.json({ updated: true });
});

// ── POST /contacts/:id/photo ──────────────────────────────────
// Receives multipart/form-data (field: photo), stores to S3.
// AWS architecture: service handles PutObject; client gets back a URL.
// In prod: swap AWS_ENDPOINT_URL for real S3 — no code changes needed.
app.post('/contacts/:id/photo', (req, res, next) => {
  // Run multer manually so fileFilter errors return 400, not 500
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId)  return res.status(401).json({ error: 'x-user-id required' });
  if (!req.file) return res.status(400).json({ error: 'photo file required (field: photo)' });

  const ext      = (req.file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const photoKey = `contacts/${req.params.id}/photo.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:      S3_BUCKET_ASSETS,
    Key:         photoKey,
    Body:        req.file.buffer,
    ContentType: req.file.mimetype,
  }));

  await db.execute(
    'UPDATE contacts SET photo_key=?, updated_at=NOW() WHERE id=? AND owner_id=?',
    [photoKey, req.params.id, ownerId]
  );
  res.json({ photo_url: photoUrl(photoKey) });
});

// ── DELETE /contacts/:id (soft) ───────────────────────────────
app.delete('/contacts/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  await db.execute(
    'UPDATE contacts SET deleted_at=NOW() WHERE id=? AND owner_id=?',
    [req.params.id, ownerId]
  );
  res.json({ deleted: true });
});

// ── POST /contacts/import — CSV bulk import ───────────────────
app.post('/contacts/import', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows array required' });
  let imported = 0, skipped = 0;
  for (const r of rows.slice(0, 1000)) {
    if (!r.first_name && !r.email) { skipped++; continue; }
    try {
      const id = uuid();
      await db.execute(
        `INSERT IGNORE INTO contacts
         (id, owner_id, first_name, last_name, email_hash, email_enc, phone_enc,
          source, temperature, profile_score)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, ownerId, r.first_name || r.email?.split('@')[0], r.last_name || null,
         r.email ? hashEmail(r.email) : null,
         encrypt(r.email), encrypt(r.phone), 'csv', 'cold', 10]
      );
      imported++;
    } catch (_) { skipped++; }
  }
  res.json({ imported, skipped });
});

// Export for in-process testing (coverage). Only listen when run directly.
if (require.main === module) {
  app.listen(PORT, () => console.log(`[contact-service] ✓ listening on :${PORT}`));
}

module.exports = { app, db };
