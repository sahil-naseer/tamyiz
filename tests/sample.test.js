import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 'https://shop.test';
const env = (extra = {}) => ({ TAMYIZ_STORE: devKV(), ADMIN_PASSWORD: PASSWORD, ...extra });
const PDF = new TextEncoder().encode('%PDF-1.4\nhello');

const call = (e, path, opts = {}) => route(new Request(BASE + path, opts), e);

async function login(e, password = PASSWORD) {
  const r = await call(e, '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return r.headers.get('Set-Cookie').split(';')[0];
}

const authed = (cookie, extra = {}) => ({ Cookie: cookie, 'X-Tamyiz-Admin': '1', ...extra });

async function addEbook(e, cookie, fields = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: 'The Architecture of Distinction',
    price: '499',
    status: 'on-sale',
    description: 'An uncompromising 140-page editorial monograph.',
    tagline: 'Foundations of Modern Minimalist Design',
    contents: 'Chapter 01: Geometry\nChapter 02: Space',
    ...fields,
  })) {
    f.append(k, v);
  }
  f.append('pdf', new Blob([PDF]), 'book.pdf');
  const res = await call(e, '/api/admin/products', { method: 'POST', headers: authed(cookie), body: f });
  return (await res.json()).product;
}

test('free sample endpoint requires valid email', async () => {
  const e = env();
  const res = await call(e, '/api/sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: 'any', email: 'notanemail' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /valid email/i);
});

test('free sample returns 404 for non-existent product', async () => {
  const e = env();
  const res = await call(e, '/api/sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: 'eb-nonexistent', email: 'reader@example.com' }),
  });
  assert.equal(res.status, 404);
});

test('submitting sample lead unlocks chapter 1 and stores lead in KV', async () => {
  const e = env();
  const cookie = await login(e);
  const book = await addEbook(e, cookie, {
    sample: 'This is the opening passage of Chapter 1 discussing architectural silence.',
    sampleChapter: 'Chapter 01 / The Silence of Form',
    sampleSubtitle: 'Reduction & Space',
  });

  const res = await call(e, '/api/sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: book.id,
      email: 'buyer@example.com',
      phone: '+91 98765 43210',
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.sample.chapter, 'Chapter 01 / The Silence of Form');
  assert.equal(data.sample.subtitle, 'Reduction &amp; Space');
  assert.match(data.sample.text, /opening passage/);
  assert.equal(data.sample.tableOfContents.length, 2);

  // Check that admin can view the collected leads
  const adminLeadsRes = await call(e, '/api/admin/leads', {
    headers: authed(cookie),
  });
  assert.equal(adminLeadsRes.status, 200);
  const leadsData = await adminLeadsRes.json();
  assert.equal(leadsData.leads.length, 1);
  assert.equal(leadsData.leads[0].email, 'buyer@example.com');
  assert.equal(leadsData.leads[0].phone, '+919876543210');

  // Check admin delete lead
  const delRes = await call(e, `/api/admin/leads/${leadsData.leads[0].id}`, {
    method: 'DELETE',
    headers: authed(cookie),
  });
  assert.equal(delRes.status, 200);

  const afterDelRes = await call(e, '/api/admin/leads', { headers: authed(cookie) });
  const afterDelData = await afterDelRes.json();
  assert.equal(afterDelData.leads.length, 0);
});

test('admin leads endpoint requires authentication', async () => {
  const e = env();
  const res = await call(e, '/api/admin/leads');
  assert.equal(res.status, 401);
});
