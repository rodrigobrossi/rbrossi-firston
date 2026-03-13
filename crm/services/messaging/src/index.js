'use strict';
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const crypto  = require('crypto');
const axios   = require('axios');
const { v4: uuid } = require('uuid');
const helmet  = require('helmet');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3006;
app.use(helmet()); app.use(cors()); app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 10, charset: 'utf8mb4',
});

// Encrypt message body (PII)
const ENC_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c  = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([c.update(text,'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(b64) {
  const buf = Buffer.from(b64,'base64');
  const iv = buf.slice(0,12); const tag = buf.slice(12,28); const enc = buf.slice(28);
  const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  d.setAuthTag(tag);
  return d.update(enc) + d.final('utf8');
}

// Call sentiment service
async function getSentiment(text) {
  try {
    const r = await axios.post(`${process.env.SENTIMENT_SERVICE_URL}/sentiment/analyze`, { text });
    return { score: r.data.stress_score, level: r.data.level };
  } catch (_) { return { score: null, level: null }; }
}

app.get('/health', (_, res) => res.json({ service: 'messaging-service', status: 'ok' }));

// GET /conversations — list conversations per user
app.get('/conversations', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const [rows] = await db.execute(
    `SELECT cv.*, c.first_name, c.last_name, co.name AS company_name,
            (SELECT body_enc FROM messages m WHERE m.conversation_id=cv.id ORDER BY m.sent_at DESC LIMIT 1) AS last_msg_enc
     FROM conversations cv
     LEFT JOIN contacts c ON cv.contact_id = c.id
     LEFT JOIN companies co ON c.company_id = co.id
     WHERE cv.owner_id=? ORDER BY cv.last_message_at DESC LIMIT 50`,
    [ownerId]
  );
  const result = rows.map(r => ({
    ...r,
    last_message: r.last_msg_enc ? decrypt(r.last_msg_enc).slice(0, 80) : null,
    last_msg_enc: undefined,
  }));
  res.json({ data: result });
});

// GET /conversations/:id/messages
app.get('/conversations/:id/messages', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const [rows] = await db.execute(
    `SELECT * FROM messages WHERE conversation_id=? AND owner_id=? ORDER BY sent_at ASC LIMIT 200`,
    [req.params.id, ownerId]
  );
  const decrypted = rows.map(r => ({ ...r, body: decrypt(r.body_enc), body_enc: undefined }));
  res.json({ data: decrypted });
});

// POST /messages — send message (WhatsApp or email)
app.post('/messages', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const { contact_id, channel, body, phone, email } = req.body;
  if (!contact_id || !channel || !body) return res.status(400).json({ error: 'contact_id, channel, body required' });

  try {
    // Get or create conversation
    let [convRows] = await db.execute(
      'SELECT id FROM conversations WHERE contact_id=? AND owner_id=? AND channel=? LIMIT 1',
      [contact_id, ownerId, channel]
    );
    let convId;
    if (!convRows.length) {
      convId = uuid();
      await db.execute(
        'INSERT INTO conversations (id, contact_id, owner_id, channel) VALUES (?,?,?,?)',
        [convId, contact_id, ownerId, channel]
      );
    } else { convId = convRows[0].id; }

    // Send via channel
    let externalId = null;
    if (channel === 'whatsapp' && process.env.WABA_API_KEY && phone) {
      const r = await axios.post(`${process.env.WABA_URL}/messages`, {
        recipient_type: 'individual', to: phone,
        type: 'text', text: { body }
      }, { headers: { 'D360-API-KEY': process.env.WABA_API_KEY } });
      externalId = r.data?.messages?.[0]?.id;
    } else if (channel === 'whatsapp') {
      console.log(`[messaging] WhatsApp simulated → ${phone || '(no phone)'}: ${body.slice(0,50)}`);
    }

    // Save message
    const msgId = uuid();
    await db.execute(
      `INSERT INTO messages (id, conversation_id, contact_id, owner_id, channel, direction, body_enc, external_id)
       VALUES (?,?,?,?,?,'out',?,?)`,
      [msgId, convId, contact_id, ownerId, channel, encrypt(body), externalId]
    );
    await db.execute('UPDATE conversations SET last_message_at=NOW() WHERE id=?', [convId]);

    res.status(201).json({ id: msgId, conversation_id: convId, sent: true });
  } catch (err) {
    console.error('[messaging] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /webhooks/whatsapp — 360dialog inbound messages
app.post('/webhooks/whatsapp', async (req, res) => {
  try {
    const { messages, contacts: waContacts } = req.body;
    if (!messages?.length) return res.sendStatus(200);

    for (const msg of messages) {
      if (msg.type !== 'text') continue;
      const phone = msg.from;
      const body  = msg.text?.body;
      if (!body) continue;

      // Analyze sentiment on inbound
      const sentiment = await getSentiment(body);

      // Find contact by phone (would need phone_hash index in prod)
      // For now save as unassigned — frontend links manually
      console.log(`[messaging] WhatsApp IN from ${phone}: "${body.slice(0,60)}" | stress=${sentiment.score}`);

      // TODO: match phone to contact, save to messages table
      // This is scaffolded for Sprint 2
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[messaging] webhook error:', err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`[messaging-service] ✓ listening on :${PORT}`));
