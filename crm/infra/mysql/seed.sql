-- ============================================================
-- FirstOn CRM — Seed Data (Development Only)
-- Creates a demo user + sample contacts for local testing
-- ============================================================
SET NAMES utf8mb4;

-- Demo user (used with /auth/dev-login)
INSERT IGNORE INTO users (id, email_hash, email_enc, name, oauth_provider, oauth_id, plan_id)
VALUES (
  'demo-user-0001-0000-0000-000000000001',
  SHA2('demo@firston.com.br', 256),
  'demo@firston.com.br',   -- not encrypted in seed (dev only)
  'Demo Brossi',
  'email',
  'demo@firston.com.br',
  'pro'
);

-- Demo subscription (active trial)
INSERT IGNORE INTO subscriptions (id, user_id, status, starts_at, next_billing)
VALUES (
  'demo-sub-00001-0000-0000-000000000001',
  'demo-user-0001-0000-0000-000000000001',
  'trialing',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 14 DAY)
);

-- Sample company
INSERT IGNORE INTO companies (id, owner_id, name, sector, size, website)
VALUES (
  'demo-comp-0001-0000-0000-000000000001',
  'demo-user-0001-0000-0000-000000000001',
  'Acme Tecnologia Ltda',
  'Tecnologia',
  'media',
  'https://acme.com.br'
);

-- Sample contacts (body_enc stores plain text in seed for readability)
INSERT IGNORE INTO contacts
  (id, owner_id, company_id, first_name, last_name, title,
   email_enc, phone_enc, profile_score, temperature,
   preferred_channel, sector, budget_brl, buy_cycle_days, source, tags)
VALUES
  ('demo-cont-0001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'demo-comp-0001-0000-0000-000000000001',
   'Carlos','Mendes','Diretor de TI',
   'carlos.mendes@acme.com.br','(11) 99999-1001',
   85,'hot','whatsapp','Tecnologia',85000.00,45,'manual',
   '["decisor","b2b","contrato_pendente"]'),

  ('demo-cont-0002-0000-0000-000000000002',
   'demo-user-0001-0000-0000-000000000001',
   NULL,
   'Mariana','Silva','CEO',
   'mariana@startupxyz.com.br','(11) 98888-2002',
   72,'warm','email','SaaS',30000.00,30,'linkedin',
   '["decisor","startup"]'),

  ('demo-cont-0003-0000-0000-000000000003',
   'demo-user-0001-0000-0000-000000000001',
   NULL,
   'Roberto','Alves','Gerente Comercial',
   'roberto.alves@indústria.com.br','(21) 97777-3003',
   55,'warm','whatsapp','Indústria',120000.00,90,'csv',
   '["influenciador"]'),

  ('demo-cont-0004-0000-0000-000000000004',
   'demo-user-0001-0000-0000-000000000001',
   NULL,
   'Patrícia','Costa','Diretora Financeira',
   'patricia@banco.com.br','(11) 96666-4004',
   40,'cold','phone','Financeiro',200000.00,120,'manual',
   '[]'),

  ('demo-cont-0005-0000-0000-000000000005',
   'demo-user-0001-0000-0000-000000000001',
   'demo-comp-0001-0000-0000-000000000001',
   'André','Lima','Analista de Compras',
   'andre.lima@acme.com.br','(11) 95555-5005',
   30,'cold','whatsapp','Tecnologia',NULL,NULL,'csv',
   '[]');

-- Sample events (calendar)
INSERT IGNORE INTO events
  (id, owner_id, contact_id, title, start_at, end_at, type, status, win_odds, notes)
VALUES
  ('demo-evt-00001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0001-0000-0000-000000000001',
   'Demo do produto — Carlos Mendes',
   DATE_ADD(NOW(), INTERVAL 1 DAY),
   DATE_ADD(NOW(), INTERVAL 1 DAY) + INTERVAL 1 HOUR,
   'demo','scheduled',70,
   'Preparar slides de ROI. Carlos quer integração com SAP.'),

  ('demo-evt-00002-0000-0000-000000000002',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0002-0000-0000-000000000002',
   'Follow-up proposta — Mariana Silva',
   DATE_ADD(NOW(), INTERVAL 3 DAY),
   DATE_ADD(NOW(), INTERVAL 3 DAY) + INTERVAL 30 MINUTE,
   'follow_up','scheduled',55,
   'Enviar proposta revisada com desconto de 10%.'),

  ('demo-evt-00003-0000-0000-000000000003',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0003-0000-0000-000000000003',
   'Reunião de alinhamento — Roberto',
   DATE_ADD(NOW(), INTERVAL 7 DAY),
   DATE_ADD(NOW(), INTERVAL 7 DAY) + INTERVAL 2 HOUR,
   'meeting','scheduled',35,NULL);

-- Sample opportunities
INSERT IGNORE INTO opportunities
  (id, owner_id, contact_id, title, stage, value_brl, win_odds, expected_close)
VALUES
  ('demo-opp-00001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0001-0000-0000-000000000001',
   'Licença Enterprise — Acme TI',
   'negotiation', 85000.00, 75,
   DATE_ADD(NOW(), INTERVAL 15 DAY)),

  ('demo-opp-00002-0000-0000-000000000002',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0002-0000-0000-000000000002',
   'Plano Pro — Startup XYZ',
   'proposal', 30000.00, 55,
   DATE_ADD(NOW(), INTERVAL 20 DAY)),

  ('demo-opp-00003-0000-0000-000000000003',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0003-0000-0000-000000000003',
   'Consultoria + Licença — Indústria',
   'qualification', 120000.00, 30,
   DATE_ADD(NOW(), INTERVAL 45 DAY)),

  ('demo-opp-00004-0000-0000-000000000004',
   'demo-user-0001-0000-0000-000000000001',
   'demo-cont-0004-0000-0000-000000000004',
   'Projeto Piloto — Banco',
   'lead', 200000.00, 10,
   DATE_ADD(NOW(), INTERVAL 90 DAY));

-- Sample conversation + messages (messaging history)
INSERT IGNORE INTO conversations
  (id, contact_id, owner_id, channel, last_message_at, stress_level)
VALUES
  ('demo-conv-0001-0000-0000-000000000001',
   'demo-cont-0001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'whatsapp', NOW(), 25.0);

INSERT IGNORE INTO messages
  (id, conversation_id, contact_id, owner_id, channel, direction, body_enc, sentiment_score, stress_level, sent_at)
VALUES
  ('demo-msg-00001-0000-0000-000000000001',
   'demo-conv-0001-0000-0000-000000000001',
   'demo-cont-0001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'whatsapp','out',
   'Olá Carlos! Tudo bem? Queria confirmar nossa demo amanhã às 14h.',
   80.0, 10.0, DATE_SUB(NOW(), INTERVAL 2 HOUR)),

  ('demo-msg-00002-0000-0000-000000000002',
   'demo-conv-0001-0000-0000-000000000001',
   'demo-cont-0001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'whatsapp','in',
   'Oi! Sim, confirmado. Mas preciso que vocês mostrem a integração com SAP urgente, porque meu diretor está cobrando.',
   45.0, 55.0, DATE_SUB(NOW(), INTERVAL 1 HOUR)),

  ('demo-msg-00003-0000-0000-000000000003',
   'demo-conv-0001-0000-0000-000000000001',
   'demo-cont-0001-0000-0000-000000000001',
   'demo-user-0001-0000-0000-000000000001',
   'whatsapp','out',
   'Perfeito Carlos! Vou preparar uma demonstração focada na integração SAP. Pode deixar!',
   85.0, 15.0, DATE_SUB(NOW(), INTERVAL 30 MINUTE));

-- Contract template
INSERT IGNORE INTO contract_templates (id, owner_id, name, body_html, is_default)
VALUES (
  'demo-tmpl-0001-0000-0000-000000000001',
  'demo-user-0001-0000-0000-000000000001',
  'Contrato Padrão de Licença SaaS',
  '<h1>CONTRATO DE LICENÇA DE SOFTWARE</h1>
<p><strong>Contratante:</strong> {{company_name}}, CNPJ {{cnpj}}</p>
<p><strong>Responsável:</strong> {{contact_name}}, {{contact_title}}</p>
<p><strong>Vigência:</strong> 12 meses a partir de {{start_date}}</p>
<p><strong>Valor:</strong> R$ {{value}} mensais</p>
<h2>CLÁUSULAS</h2>
<p>1. O contratante terá acesso à plataforma FirstOn CRM pelo período estipulado.</p>
<p>2. O pagamento será realizado mensalmente via PIX até o dia 10 de cada mês.</p>
<p>3. Suporte técnico incluso em horário comercial (8h–18h, dias úteis).</p>
<p>4. Dados do contratante são protegidos conforme a LGPD (Lei 13.709/2018).</p>
<br/><br/>
<p>São Paulo, {{date}}</p>
<p>_____________________________&nbsp;&nbsp;&nbsp;&nbsp;_____________________________</p>
<p>Contratante&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Contratada (Brossi Consulting)</p>',
  1
);
