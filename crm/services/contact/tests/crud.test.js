'use strict';
/**
 * Contact Service — CRUD Integration Tests
 *
 * Two modes:
 *
 *  Integration (default, against running Docker service):
 *    node --test tests/crud.test.js
 *    npm test
 *
 *  Coverage (in-process via supertest — instruments src/index.js):
 *    npm run test:coverage
 *
 * Each test uses an isolated owner ID so it never touches production or
 * seed data. All contacts created are soft-deleted in afterEach.
 */

const { test, before, after, afterEach, describe } = require('node:test');
const assert   = require('node:assert/strict');
const supertest = require('supertest');

// ── Transport setup ──────────────────────────────────────────────────────────
// When CONTACT_SERVICE_URL is set → test against the running HTTP server.
// Otherwise                       → import the Express app in-process (coverage mode).
let agent;
let _db; // reference kept to close the pool after all tests

before(async () => {
  const target = process.env.CONTACT_SERVICE_URL;
  if (target) {
    agent = supertest(target);
    const res = await agent.get('/health');
    assert.equal(res.body.status, 'ok', `Service not ready at ${target}`);
    console.log(`  ✔ service at ${target} is up (HTTP mode)`);
  } else {
    const mod = require('../src/index');
    agent = supertest(mod.app);
    _db   = mod.db;   // saved so we can close the pool after tests
    console.log('  ✔ app loaded in-process (coverage mode)');
  }
});

// Close the MySQL pool so the process can exit cleanly after coverage runs
after(async () => {
  if (_db) await _db.end().catch(() => {});
});

// ── Unique per-run owner IDs — full DB isolation ─────────────────────────────
const OWNER = `test-${Date.now()}`;
const OTHER = `other-${Date.now()}`;

// Contacts created during a test — soft-deleted in afterEach
const created = [];

// ── Request helper ───────────────────────────────────────────────────────────
async function req(method, path, { body, owner = OWNER } = {}) {
  const r = agent[method.toLowerCase()](path).set('x-user-id', owner);
  if (body !== undefined) r.send(body);
  const res = await r;
  return { status: res.status, body: res.body };
}

async function create(data = {}, opts = {}) {
  const payload = { first_name: 'Test', ...data };
  const r = await req('POST', '/contacts', { body: payload, ...opts });
  if (r.status === 201) created.push({ id: r.body.id, owner: opts.owner ?? OWNER });
  return r;
}

async function cleanup() {
  for (const { id, owner } of created.splice(0)) {
    await req('DELETE', `/contacts/${id}`, { owner }).catch(() => {});
  }
}

afterEach(cleanup);

// ── Minimal valid 1×1 PNG (67 bytes) ────────────────────────────────────────
const TEST_PNG = Buffer.from(
  '89504e470d0a1a0a' +
  '0000000d4948445200000001000000010802000000' +
  '907753de' +
  '0000000c49444154789c63f80f000000010100' +
  '0518d84e' +
  '0000000049454e44ae426082',
  'hex'
);

// ── POST /contacts ───────────────────────────────────────────────────────────
describe('POST /contacts', () => {

  test('creates a contact with minimal fields', async () => {
    const r = await create({ first_name: 'João' });
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
    assert.ok(typeof r.body.profile_score === 'number');
  });

  test('creates a contact with all PII fields', async () => {
    const r = await create({
      first_name:        'Maria',
      last_name:         'Silva',
      preferred_name:    'Malu',
      email:             'maria.silva@test.com',
      phone:             '+55 11 99999-0001',
      phone2:            '+55 11 88888-0002',
      cpf:               '123.456.789-00',
      date_of_birth:     '1990-06-15',
      sex:               'female',
      gender:            'Mulher cisgênero',
      address:           'Av. Paulista, 1000, São Paulo, SP',
      address_lat:       -23.5617,
      address_lng:       -46.6561,
      title:             'Engenheira de Software',
      sector:            'tech',
      linkedin_url:      'https://linkedin.com/in/mariasilva',
      temperature:       'hot',
      preferred_channel: 'email',
      budget_brl:        15000,
      tags:              ['vip', 'b2b'],
    });
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
    assert.ok(r.body.profile_score > 0);
  });

  test('rejects when first_name is missing', async () => {
    const r = await req('POST', '/contacts', { body: { last_name: 'Only' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /first_name/);
  });

  test('rejects when x-user-id header is missing', async () => {
    const res = await agent.post('/contacts').send({ first_name: 'Ghost' });
    assert.equal(res.status, 401);
  });

  test('profile_score increases with more fields', async () => {
    const minimal = await create({ first_name: 'A' });
    const full    = await create({
      first_name: 'B', last_name: 'C',
      email: 'b@c.com', phone: '+55 11 1234-5678', title: 'CEO',
    });
    assert.ok(full.body.profile_score > minimal.body.profile_score);
  });

  test('temperature defaults to cold', async () => {
    const r = await create({ first_name: 'NoTemp' });
    assert.equal(r.status, 201);
    const { body } = await req('GET', `/contacts/${r.body.id}`);
    assert.equal(body.temperature, 'cold');
  });

  test('preferred_channel defaults to whatsapp', async () => {
    const r = await create({ first_name: 'NoCh' });
    const { body } = await req('GET', `/contacts/${r.body.id}`);
    assert.equal(body.preferred_channel, 'whatsapp');
  });
});

// ── GET /contacts ────────────────────────────────────────────────────────────
describe('GET /contacts', () => {

  test('returns only contacts belonging to the owner', async () => {
    await create({ first_name: 'Mine1' });
    await create({ first_name: 'Mine2' });
    await create({ first_name: 'NotMine' }, { owner: OTHER });

    const { body } = await req('GET', '/contacts?limit=100');
    const names = body.data.map(c => c.first_name);
    assert.ok(names.includes('Mine1'));
    assert.ok(names.includes('Mine2'));
    assert.ok(!names.includes('NotMine'));
  });

  test('returns data and total', async () => {
    await create({ first_name: 'Alpha' });
    await create({ first_name: 'Beta' });

    const { status, body } = await req('GET', '/contacts?limit=100');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.total >= 2);
  });

  test('filters by temperature', async () => {
    await create({ first_name: 'Hot',  temperature: 'hot' });
    await create({ first_name: 'Cold', temperature: 'cold' });

    const { body } = await req('GET', '/contacts?limit=100&temperature=hot');
    assert.ok(body.data.every(c => c.temperature === 'hot'));
    assert.ok(body.data.some(c => c.first_name === 'Hot'));
  });

  test('respects limit and offset', async () => {
    for (let i = 1; i <= 3; i++) await create({ first_name: `Page${i}` });

    const page1 = await req('GET', '/contacts?limit=2&offset=0');
    const page2 = await req('GET', '/contacts?limit=2&offset=2');

    assert.equal(page1.body.data.length, 2);
    assert.ok(page2.body.data.length >= 1);

    const ids1 = page1.body.data.map(c => c.id);
    const ids2 = page2.body.data.map(c => c.id);
    assert.equal(ids1.filter(id => ids2.includes(id)).length, 0);
  });

  test('does not return deleted contacts', async () => {
    const { body: { id } } = await create({ first_name: 'WillDie' });
    await req('DELETE', `/contacts/${id}`);
    created.splice(created.findIndex(x => x.id === id), 1);

    const { body } = await req('GET', '/contacts?limit=100');
    assert.ok(!body.data.some(x => x.id === id));
  });

  test('PII fields are decrypted in list response', async () => {
    const email = `list-pii-${Date.now()}@test.com`;
    await create({ first_name: 'PiiTest', email, phone: '+55 11 77777-9999' });

    const { body } = await req('GET', '/contacts?limit=100');
    const found = body.data.find(c => c.first_name === 'PiiTest');
    assert.ok(found);
    assert.equal(found.email, email);
    assert.equal(found.phone, '+55 11 77777-9999');
    assert.equal(found.email_enc, undefined);
    assert.equal(found.phone_enc, undefined);
  });

  test('requires x-user-id header', async () => {
    const res = await agent.get('/contacts');
    assert.equal(res.status, 401);
  });
});

// ── GET /contacts/:id ────────────────────────────────────────────────────────
describe('GET /contacts/:id', () => {

  test('returns the full contact by id', async () => {
    const email = `get-${Date.now()}@test.com`;
    const { body: { id } } = await create({
      first_name: 'FullGet', last_name: 'Sobrenome', email,
      phone: '+55 11 91111-2222', preferred_name: 'FG',
      date_of_birth: '1985-03-20', sex: 'male', temperature: 'warm',
    });

    const { status, body } = await req('GET', `/contacts/${id}`);
    assert.equal(status, 200);
    assert.equal(body.first_name,    'FullGet');
    assert.equal(body.last_name,     'Sobrenome');
    assert.equal(body.email,         email);
    assert.equal(body.phone,         '+55 11 91111-2222');
    assert.equal(body.preferred_name,'FG');
    assert.equal(body.date_of_birth, '1985-03-20');
    assert.equal(body.sex,           'male');
    assert.equal(body.temperature,   'warm');
  });

  test('returns 404 for a non-existent id', async () => {
    const { status } = await req('GET', '/contacts/00000000-0000-0000-0000-000000000000');
    assert.equal(status, 404);
  });

  test("returns 404 for another owner's contact", async () => {
    const { body: { id } } = await create({ first_name: 'Private' });
    const { status } = await req('GET', `/contacts/${id}`, { owner: OTHER });
    assert.equal(status, 404);
  });

  test('does not expose raw encrypted blobs', async () => {
    const { body: { id } } = await create({ first_name: 'NoBlobsPlease', email: 'x@x.com' });
    const { body } = await req('GET', `/contacts/${id}`);
    assert.equal(body.email_enc,          undefined);
    assert.equal(body.phone_enc,          undefined);
    assert.equal(body.cpf_enc,            undefined);
    assert.equal(body.date_of_birth_enc,  undefined);
    assert.equal(body.preferred_name_enc, undefined);
    assert.equal(body.address_enc,        undefined);
  });
});

// ── PATCH /contacts/:id ──────────────────────────────────────────────────────
describe('PATCH /contacts/:id', () => {

  test('updates plain fields', async () => {
    const { body: { id } } = await create({ first_name: 'Before', last_name: 'Old', temperature: 'cold' });

    const patch = await req('PATCH', `/contacts/${id}`, {
      body: { first_name: 'After', last_name: 'New', temperature: 'hot' },
    });
    assert.equal(patch.status, 200);
    assert.deepEqual(patch.body, { updated: true });

    const { body } = await req('GET', `/contacts/${id}`);
    assert.equal(body.first_name,  'After');
    assert.equal(body.last_name,   'New');
    assert.equal(body.temperature, 'hot');
  });

  test('updates encrypted PII fields and decrypts correctly', async () => {
    const { body: { id } } = await create({ first_name: 'PiiPatch', email: 'old@test.com' });

    await req('PATCH', `/contacts/${id}`, {
      body: {
        email:          'new@test.com',
        phone:          '+55 21 99999-8888',
        phone2:         '+55 21 88888-7777',
        preferred_name: 'Novo apelido',
        date_of_birth:  '1992-11-30',
        address:        'Rua das Flores, 42, Rio de Janeiro',
      },
    });

    const { body } = await req('GET', `/contacts/${id}`);
    assert.equal(body.email,          'new@test.com');
    assert.equal(body.phone,          '+55 21 99999-8888');
    assert.equal(body.phone2,         '+55 21 88888-7777');
    assert.equal(body.preferred_name, 'Novo apelido');
    assert.equal(body.date_of_birth,  '1992-11-30');
    assert.equal(body.address,        'Rua das Flores, 42, Rio de Janeiro');
  });

  test("handles empty sex (converts to null, no DB error)", async () => {
    const { body: { id } } = await create({ first_name: 'SexTest', sex: 'male' });

    const r = await req('PATCH', `/contacts/${id}`, { body: { sex: '' } });
    assert.equal(r.status, 200, `PATCH with sex='' must not fail: ${JSON.stringify(r.body)}`);

    const { body } = await req('GET', `/contacts/${id}`);
    assert.equal(body.sex, null);
  });

  test('updates location coordinates', async () => {
    const { body: { id } } = await create({ first_name: 'GeoTest' });

    await req('PATCH', `/contacts/${id}`, {
      body: { address: 'Praça da Sé, São Paulo, SP', address_lat: -23.5503, address_lng: -46.6340 },
    });

    const { body } = await req('GET', `/contacts/${id}`);
    assert.equal(body.address, 'Praça da Sé, São Paulo, SP');
    assert.ok(Math.abs(Number(body.address_lat) - (-23.5503)) < 0.0001);
    assert.ok(Math.abs(Number(body.address_lng) - (-46.6340)) < 0.0001);
  });

  test('returns 400 when body has no recognised fields', async () => {
    const { body: { id } } = await create({ first_name: 'NoOp' });
    const r = await req('PATCH', `/contacts/${id}`, { body: { unknownField: 'x' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Nothing to update/);
  });

  test("does not allow patching another owner's contact", async () => {
    const { body: { id } } = await create({ first_name: 'ProtectedPatch' });
    await req('PATCH', `/contacts/${id}`, { owner: OTHER, body: { first_name: 'Hijacked' } });

    const { body } = await req('GET', `/contacts/${id}`);
    assert.equal(body.first_name, 'ProtectedPatch');
  });

  test('updates tags array', async () => {
    const { body: { id } } = await create({ first_name: 'TagTest', tags: ['a', 'b'] });

    await req('PATCH', `/contacts/${id}`, { body: { tags: ['vip', 'b2b', 'tech'] } });

    const { body } = await req('GET', `/contacts/${id}`);
    assert.deepEqual(body.tags.sort(), ['b2b', 'tech', 'vip']);
  });
});

// ── DELETE /contacts/:id ─────────────────────────────────────────────────────
describe('DELETE /contacts/:id', () => {

  test('soft-deletes the contact', async () => {
    const { body: { id } } = await create({ first_name: 'ToDelete' });

    const del = await req('DELETE', `/contacts/${id}`);
    assert.equal(del.status, 200);
    assert.deepEqual(del.body, { deleted: true });

    const list = await req('GET', '/contacts?limit=100');
    assert.ok(!list.body.data.some(c => c.id === id));

    const get = await req('GET', `/contacts/${id}`);
    assert.equal(get.status, 404);

    const idx = created.findIndex(x => x.id === id);
    if (idx !== -1) created.splice(idx, 1);
  });

  test("does not delete another owner's contact", async () => {
    const { body: { id } } = await create({ first_name: 'ProtectedDelete' });
    await req('DELETE', `/contacts/${id}`, { owner: OTHER });

    const { status } = await req('GET', `/contacts/${id}`);
    assert.equal(status, 200);
  });

  test('deleting a non-existent id returns success (idempotent)', async () => {
    const r = await req('DELETE', '/contacts/00000000-0000-0000-0000-000000000000');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { deleted: true });
  });
});

// ── POST /contacts/:id/photo ─────────────────────────────────────────────────
describe('POST /contacts/:id/photo', () => {

  test('uploads a photo and returns a photo_url', async () => {
    const { body: { id } } = await create({ first_name: 'PhotoTest' });

    const res = await agent
      .post(`/contacts/${id}/photo`)
      .set('x-user-id', OWNER)
      .attach('photo', TEST_PNG, { filename: 'test.png', contentType: 'image/png' });

    assert.equal(res.status, 200, `photo upload failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.photo_url);
    assert.match(res.body.photo_url, /localhost:4566|localstack|s3\.amazonaws/);

    const { body: contact } = await req('GET', `/contacts/${id}`);
    assert.ok(contact.photo_url);
  });

  test('rejects non-image uploads', async () => {
    const { body: { id } } = await create({ first_name: 'NoTextFile' });

    const res = await agent
      .post(`/contacts/${id}/photo`)
      .set('x-user-id', OWNER)
      .attach('photo', Buffer.from('not an image'), { filename: 'hack.txt', contentType: 'text/plain' });

    assert.equal(res.status, 400);
  });

  test('rejects upload without photo field', async () => {
    const { body: { id } } = await create({ first_name: 'NoPhotoField' });

    const res = await agent
      .post(`/contacts/${id}/photo`)
      .set('x-user-id', OWNER)
      .field('other_field', 'something');

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

// ── POST /contacts/import ────────────────────────────────────────────────────
describe('POST /contacts/import', () => {

  test('bulk imports valid rows', async () => {
    const rows = [
      { first_name: 'Import1', email: `imp1-${Date.now()}@test.com` },
      { first_name: 'Import2', email: `imp2-${Date.now()}@test.com` },
      { first_name: 'Import3', phone: '+55 11 91111-1111' },
    ];

    const r = await req('POST', '/contacts/import', { body: { rows } });
    assert.equal(r.status, 200);
    assert.equal(r.body.imported, 3);
    assert.equal(r.body.skipped,  0);

    // Cleanup imported contacts
    const list = await req('GET', '/contacts?limit=100');
    for (const c of list.body.data.filter(c => c.first_name?.startsWith('Import'))) {
      await req('DELETE', `/contacts/${c.id}`);
    }
  });

  test('skips rows with no first_name and no email', async () => {
    const r = await req('POST', '/contacts/import', {
      body: { rows: [{ phone: '+55 11 00000-0000' }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.skipped,  1);
    assert.equal(r.body.imported, 0);
  });

  test('rejects empty rows array', async () => {
    const r = await req('POST', '/contacts/import', { body: { rows: [] } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /rows array/);
  });
});

// ── GET /health ──────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns service status ok', async () => {
    const res = await agent.get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status,  'ok');
    assert.equal(res.body.service, 'contact-service');
  });
});
