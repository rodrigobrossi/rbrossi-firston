'use strict';
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const { v4: uuid } = require('uuid');
const helmet  = require('helmet');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3005;
app.use(helmet()); app.use(cors()); app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 5, charset: 'utf8mb4',
});

app.get('/health', (_, res) => res.json({ service: 'contract-service', status: 'ok' }));

// GET /contracts
app.get('/contracts', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const [rows] = await db.execute(
    `SELECT ct.*, c.first_name, c.last_name, co.name AS company_name
     FROM contracts ct
     LEFT JOIN opportunities o ON ct.opportunity_id = o.id
     LEFT JOIN contacts c ON o.contact_id = c.id
     LEFT JOIN companies co ON c.company_id = co.id
     WHERE ct.owner_id=? ORDER BY ct.created_at DESC`, [ownerId]
  );
  res.json({ data: rows });
});

// POST /contracts — generate from template
app.post('/contracts', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const { opportunity_id, title, template_id, variables } = req.body;
  if (!opportunity_id || !title) return res.status(400).json({ error: 'opportunity_id and title required' });

  try {
    // Get template
    let body = `<h1>${title}</h1><p>Contrato gerado em ${new Date().toLocaleDateString('pt-BR')}</p>`;
    if (template_id) {
      const [tmpl] = await db.execute('SELECT body_html FROM contract_templates WHERE id=? AND owner_id=?', [template_id, ownerId]);
      if (tmpl.length) {
        body = tmpl[0].body_html;
        // Replace {{variable}} placeholders
        if (variables) {
          for (const [k, v] of Object.entries(variables)) {
            body = body.replaceAll(`{{${k}}}`, v);
          }
        }
      }
    }

    // In prod: render to PDF → upload to S3 → store s3_key
    // Local dev: store HTML in DB directly
    const id = uuid();
    const s3Key = `contracts/${ownerId}/${id}.pdf`; // would be real S3 key in prod
    await db.execute(
      `INSERT INTO contracts (id, opportunity_id, owner_id, title, template_id, s3_key, status)
       VALUES (?,?,?,?,?,?,?)`,
      [id, opportunity_id, ownerId, title, template_id||null, s3Key, 'draft']
    );

    console.log(`[contract] Created contract ${id} for opportunity ${opportunity_id}`);
    // Local: return HTML — prod: return pre-signed S3 URL
    res.status(201).json({ id, status: 'draft', s3_key: s3Key, preview_html: body });
  } catch (err) {
    console.error('[contract] create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /contracts/:id — update status (sent, signed, cancelled)
app.patch('/contracts/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { status } = req.body;
  const valid = ['draft','sent','signed','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: `Status must be: ${valid.join(', ')}` });
  const sets = ['status=?']; const params = [status];
  if (status === 'signed') { sets.push('signed_at=NOW()'); }
  params.push(req.params.id, ownerId);
  await db.execute(`UPDATE contracts SET ${sets.join(',')} WHERE id=? AND owner_id=?`, params);
  res.json({ updated: true });
});

// GET /contracts/templates
app.get('/contracts/templates', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const [rows] = await db.execute('SELECT id,name,is_default FROM contract_templates WHERE owner_id=?', [ownerId]);
  res.json({ data: rows });
});

// POST /contracts/templates
app.post('/contracts/templates', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { name, body_html } = req.body;
  if (!name || !body_html) return res.status(400).json({ error: 'name and body_html required' });
  const id = uuid();
  await db.execute('INSERT INTO contract_templates (id,owner_id,name,body_html) VALUES (?,?,?,?)', [id,ownerId,name,body_html]);
  res.status(201).json({ id });
});

app.listen(PORT, () => console.log(`[contract-service] ✓ listening on :${PORT}`));
