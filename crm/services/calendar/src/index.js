'use strict';
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const { v4: uuid } = require('uuid');
const helmet  = require('helmet');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3003;
app.use(helmet()); app.use(cors()); app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 10, charset: 'utf8mb4',
});

app.get('/health', (_, res) => res.json({ service: 'calendar-service', status: 'ok' }));

// GET /events?start=2026-03-01&end=2026-03-31
app.get('/events', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const { start, end, contact_id } = req.query;
  try {
    let sql = `SELECT e.*, c.first_name, c.last_name
               FROM events e LEFT JOIN contacts c ON e.contact_id = c.id
               WHERE e.owner_id = ?`;
    const params = [ownerId];
    if (start) { sql += ' AND e.start_at >= ?'; params.push(start); }
    if (end)   { sql += ' AND e.start_at <= ?'; params.push(end); }
    if (contact_id) { sql += ' AND e.contact_id = ?'; params.push(contact_id); }
    sql += ' ORDER BY e.start_at ASC LIMIT 200';
    const [rows] = await db.execute(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /events
app.post('/events', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const { title, start_at, end_at, contact_id, type, status, win_odds, notes, location } = req.body;
  if (!title || !start_at || !end_at) return res.status(400).json({ error: 'title, start_at, end_at required' });
  const id = uuid();
  try {
    await db.execute(
      `INSERT INTO events (id, owner_id, contact_id, title, start_at, end_at, type, status, win_odds, notes, location)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ownerId, contact_id||null, title, start_at, end_at,
       type||'meeting', status||'scheduled', win_odds||null, notes||null, location||null]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /events/:id
app.patch('/events/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { status, win_odds, notes, start_at, end_at } = req.body;
  const sets = []; const params = [];
  if (status   !== undefined) { sets.push('status=?');    params.push(status); }
  if (win_odds !== undefined) { sets.push('win_odds=?');  params.push(win_odds); }
  if (notes    !== undefined) { sets.push('notes=?');     params.push(notes); }
  if (start_at !== undefined) { sets.push('start_at=?');  params.push(start_at); }
  if (end_at   !== undefined) { sets.push('end_at=?');    params.push(end_at); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id, ownerId);
  await db.execute(`UPDATE events SET ${sets.join(',')} WHERE id=? AND owner_id=?`, params);
  res.json({ updated: true });
});

// DELETE /events/:id
app.delete('/events/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  await db.execute('DELETE FROM events WHERE id=? AND owner_id=?', [req.params.id, ownerId]);
  res.json({ deleted: true });
});

app.listen(PORT, () => console.log(`[calendar-service] ✓ listening on :${PORT}`));
