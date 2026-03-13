'use strict';
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const { v4: uuid } = require('uuid');
const helmet  = require('helmet');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3008;
app.use(helmet()); app.use(cors()); app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 5, charset: 'utf8mb4',
});

// ── Secure PIX key retrieval ──────────────────────────────────
// Local dev: env var. Prod: AWS Secrets Manager (sa-east-1)
let _pixCache = null;
async function getPixKey() {
  if (_pixCache) return _pixCache;
  if (process.env.USE_AWS_SECRETS === 'true') {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: 'sa-east-1', endpoint: process.env.AWS_ENDPOINT_URL });
    const data   = await client.send(new GetSecretValueCommand({ SecretId: 'firston/billing/pix-key' }));
    _pixCache    = JSON.parse(data.SecretString);
  } else {
    console.warn('[billing] ⚠ Using local dev PIX key — not for production');
    _pixCache = { pix_key: process.env.PIX_KEY_LOCAL_DEV, pix_type: 'CPF' };
  }
  setTimeout(() => { _pixCache = null; }, 60 * 60 * 1000); // expire cache after 1h
  return _pixCache;
}

// ── Efí Bank PIX integration ──────────────────────────────────
// Docs: https://dev.efipay.com.br/docs/api-pix/
async function createPixCharge({ userId, txid, value }) {
  const pix = await getPixKey();
  // In sandbox mode, we just simulate
  if (process.env.EFI_SANDBOX === 'true' || !process.env.EFI_CLIENT_ID) {
    console.log(`[billing] PIX charge simulated: txid=${txid} value=R$${value} key=${pix.pix_key.slice(0,6)}***`);
    return {
      txid,
      status: 'ATIVA',
      valor: { original: value },
      pix_copy_paste: `00020126580014br.gov.bcb.pix0136${pix.pix_key}5204000053039865802BR5925FirstOn CRM6009SAO PAULO62140510${txid}6304ABCD`,
      qr_code_url: `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=simulado_${txid}`,
    };
  }
  // Real Efí Bank call (prod)
  const axios = require('axios');
  const auth = await axios.post('https://pix.api.efipay.com.br/oauth/token',
    'grant_type=client_credentials',
    { auth: { username: process.env.EFI_CLIENT_ID, password: process.env.EFI_CLIENT_SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const resp = await axios.put(
    `https://pix.api.efipay.com.br/v2/cob/${txid}`,
    { calendario: { expiracao: 3600 }, valor: { original: value },
      chave: pix.pix_key,
      infoAdicionais: [{ nome: 'Produto', valor: 'FirstOn CRM Pro — 1 mês' }] },
    { headers: { Authorization: `Bearer ${auth.data.access_token}` } }
  );
  return resp.data;
}

// ── Routes ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ service: 'billing-service', status: 'ok' }));

// Create subscription charge
app.post('/billing/charge', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const txid  = `FO${Date.now()}${user_id.slice(0,4).toUpperCase()}`;
    const value = process.env.PLAN_PRICE_BRL || '39.90';
    const charge = await createPixCharge({ userId: user_id, txid, value });
    // Record in DB
    await db.execute(
      `INSERT INTO subscriptions (id, user_id, plan, price_brl, status, pix_txid)
       VALUES (?, ?, 'pro', ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE pix_txid=?, status='pending'`,
      [uuid(), user_id, value, txid, txid]
    );
    res.json({ txid, value, ...charge });
  } catch (err) {
    console.error('[billing] charge error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook — Efí confirms payment
app.post('/webhooks/pix', async (req, res) => {
  try {
    const { pix } = req.body;
    if (!Array.isArray(pix)) return res.sendStatus(200);
    for (const p of pix) {
      const { txid, valor, endToEndId } = p;
      console.log(`[billing] ✅ PIX confirmed: txid=${txid} R$${valor} e2e=${endToEndId}`);
      await db.execute(
        `UPDATE subscriptions SET status='active', starts_at=NOW(),
         next_billing=DATE_ADD(NOW(), INTERVAL 1 MONTH)
         WHERE pix_txid=?`, [txid]
      );
      // TODO: notify notification-service to send confirmation email
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('[billing] webhook error:', err.message);
    res.sendStatus(500);
  }
});

// Get subscription status
app.get('/billing/subscription/:userId', async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
    [req.params.userId]
  );
  if (!rows.length) return res.json({ status: 'none' });
  res.json(rows[0]);
});

app.listen(PORT, () => console.log(`[billing-service] ✓ listening on :${PORT}`));
