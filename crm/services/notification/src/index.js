'use strict';
require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const nodemailer = require('nodemailer');
const { v4: uuid } = require('uuid');
const helmet   = require('helmet');
const cors     = require('cors');

const app  = express();
const PORT = process.env.PORT || 3009;
app.use(helmet()); app.use(cors()); app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASS, connectionLimit: 5, charset: 'utf8mb4',
});

// Mailer — Mailhog locally, AWS SES in prod
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailhog',
  port: parseInt(process.env.SMTP_PORT) || 1025,
  secure: false,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER, pass: process.env.SMTP_PASS
  } : undefined,
});

async function sendEmail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: '"FirstOn CRM" <noreply@firston.com.br>',
      to, subject, html
    });
    console.log(`[notification] Email sent to ${to}: ${info.messageId}`);
    return info.messageId;
  } catch (err) {
    console.error('[notification] Email error:', err.message);
    throw err;
  }
}

app.get('/health', (_, res) => res.json({ service: 'notification-service', status: 'ok' }));

// POST /notify/email
app.post('/notify/email', async (req, res) => {
  const { to, subject, html, user_id } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject, html required' });
  try {
    const messageId = await sendEmail({ to, subject, html });
    res.json({ sent: true, messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /notify/subscription-confirmed
app.post('/notify/subscription-confirmed', async (req, res) => {
  const { user_id, email, name } = req.body;
  await sendEmail({
    to: email,
    subject: '✅ Assinatura FirstOn CRM confirmada!',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0D1B2A">Olá, ${name}! 👋</h2>
        <p>Seu pagamento PIX foi confirmado e sua assinatura <strong>FirstOn CRM Pro</strong> está ativa.</p>
        <p style="font-size:24px;font-weight:bold;color:#0E7AFE">R$ 39,90/mês</p>
        <p>Acesse agora: <a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a></p>
        <hr/>
        <p style="color:#9CA3AF;font-size:12px">
          Próxima cobrança em 30 dias. Dúvidas? Responda este e-mail.
        </p>
      </div>
    `
  });
  res.json({ sent: true });
});

// POST /notify/event-reminder
app.post('/notify/event-reminder', async (req, res) => {
  const { email, name, event_title, start_at, contact_name } = req.body;
  await sendEmail({
    to: email,
    subject: `📅 Lembrete: ${event_title} em 30 minutos`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0D1B2A">Lembrete de agenda</h2>
        <p>Olá <strong>${name}</strong>, você tem um compromisso em breve:</p>
        <div style="background:#F0F4F8;padding:16px;border-radius:8px;margin:16px 0">
          <strong>${event_title}</strong><br/>
          📅 ${new Date(start_at).toLocaleString('pt-BR')}<br/>
          👤 ${contact_name || 'Contato não especificado'}
        </div>
        <a href="${process.env.FRONTEND_URL}/calendar"
           style="background:#0E7AFE;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">
          Ver no calendário
        </a>
      </div>
    `
  });
  res.json({ sent: true });
});

app.listen(PORT, () => {
  console.log(`[notification-service] ✓ listening on :${PORT}`);
  console.log(`  → Emails visible at: http://localhost:8025 (Mailhog)`);
});
