'use strict';
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const { v4: uuid } = require('uuid');
const helmet  = require('helmet');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3004;
app.use(helmet()); app.use(cors()); app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 10, charset: 'utf8mb4',
});

const STAGES = ['lead','qualification','proposal','negotiation','won','lost'];

// Win odds auto-suggestion per stage
const STAGE_ODDS = { lead:10, qualification:30, proposal:55, negotiation:75, won:100, lost:0 };

app.get('/health', (_, res) => res.json({ service: 'pipeline-service', status: 'ok' }));

// GET /opportunities — full pipeline board
app.get('/opportunities', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  try {
    const [rows] = await db.execute(
      `SELECT o.*, c.first_name, c.last_name, co.name AS company_name
       FROM opportunities o
       LEFT JOIN contacts c ON o.contact_id = c.id
       LEFT JOIN companies co ON c.company_id = co.id
       WHERE o.owner_id = ?
       ORDER BY FIELD(o.stage,'lead','qualification','proposal','negotiation','won','lost'), o.updated_at DESC`,
      [ownerId]
    );
    // Group by stage for Kanban
    const board = {};
    for (const s of STAGES) board[s] = [];
    for (const r of rows) board[r.stage].push(r);
    res.json({ board, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /opportunities
app.post('/opportunities', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const { contact_id, title, stage, value_brl, win_odds, notes, expected_close } = req.body;
  if (!contact_id || !title) return res.status(400).json({ error: 'contact_id and title required' });
  const s = stage || 'lead';
  const id = uuid();
  await db.execute(
    `INSERT INTO opportunities (id, owner_id, contact_id, title, stage, value_brl, win_odds, notes, expected_close)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, ownerId, contact_id, title, s, value_brl||null,
     win_odds ?? STAGE_ODDS[s], notes||null, expected_close||null]
  );
  res.status(201).json({ id, stage: s, win_odds: win_odds ?? STAGE_ODDS[s] });
});

// PATCH /opportunities/:id — move stage, update win_odds
app.patch('/opportunities/:id', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const { stage, win_odds, value_brl, notes, expected_close } = req.body;
  const sets = ['updated_at=NOW()']; const params = [];
  if (stage) {
    if (!STAGES.includes(stage)) return res.status(400).json({ error: `Invalid stage. Use: ${STAGES.join(', ')}` });
    sets.push('stage=?'); params.push(stage);
    // Auto-set win_odds when moving stage (unless explicitly provided)
    if (win_odds === undefined) { sets.push('win_odds=?'); params.push(STAGE_ODDS[stage]); }
    if (stage === 'won' || stage === 'lost') { sets.push('closed_at=NOW()'); }
  }
  if (win_odds     !== undefined) { sets.push('win_odds=?');     params.push(win_odds); }
  if (value_brl    !== undefined) { sets.push('value_brl=?');    params.push(value_brl); }
  if (notes        !== undefined) { sets.push('notes=?');        params.push(notes); }
  if (expected_close !== undefined) { sets.push('expected_close=?'); params.push(expected_close); }
  params.push(req.params.id, ownerId);
  await db.execute(`UPDATE opportunities SET ${sets.join(',')} WHERE id=? AND owner_id=?`, params);
  res.json({ updated: true });
});

// GET /opportunities/stats — pipeline summary
app.get('/opportunities/stats', async (req, res) => {
  const ownerId = req.headers['x-user-id'];
  const [rows] = await db.execute(
    `SELECT stage, COUNT(*) AS count, SUM(value_brl) AS total_value, AVG(win_odds) AS avg_odds
     FROM opportunities WHERE owner_id=? GROUP BY stage`, [ownerId]
  );
  const weighted = rows.reduce((sum, r) => sum + (r.total_value || 0) * (r.avg_odds / 100), 0);
  res.json({ by_stage: rows, weighted_pipeline: Math.round(weighted) });
});

app.listen(PORT, () => console.log(`[pipeline-service] ✓ listening on :${PORT}`));
