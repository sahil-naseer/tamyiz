import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';
import { markCartRecovered } from '../server/abandoned.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 'https://shop.test';
const CATALOG = [
  { id: 'eb-01', slug: 'monograph-01', name: 'Monograph 01', price: 499, status: 'on-sale', fileSize: 10, createdAt: 2 },
  { id: 'eb-02', slug: 'monograph-02', name: 'Monograph 02', price: 499, status: 'on-sale', fileSize: 10, createdAt: 1 },
];
const env = (extra = {}) => {
  const kv = devKV();
  kv.put('products', JSON.stringify(CATALOG));
  return { TAMYIZ_STORE: kv, ADMIN_PASSWORD: PASSWORD, DOWNLOAD_SECRET: 'test-secret', BREVO_API_KEY: 'test-brevo', ...extra };
};
// Emails are "sent" to a fake Brevo that records them.
const sentEmails = [];
globalThis.fetch = async (url, opts = {}) => {
  sentEmails.push({ url: String(url), body: JSON.parse(opts.body || '{}') });
  return new Response('{}', { status: 201 });
};

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

test('abandoned cart: tracks cart intent and validates input', async () => {
  const e = env();

  // Invalid email rejected
  const badRes = await call(e, '/api/abandoned-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bad' }),
  });
  assert.equal(badRes.status, 400);

  // Valid tracking
  const res = await call(e, '/api/abandoned-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'visitor@example.com',
      phone: '+919876543210',
      items: [{ productId: 'eb-01', name: 'Monograph 01', price: 499 }],
      subtotal: 499,
      total: 499,
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.id);
});

test('admin abandoned cart: list, send recovery email, and mark recovered upon purchase', async () => {
  const e = env();
  const cookie = await login(e);

  // 1. Visitor leaves cart
  const trackRes = await call(e, '/api/abandoned-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'prospect@luxury.com',
      phone: '+919876543210',
      items: [
        { productId: 'eb-01', name: 'Monograph 01', price: 499 },
        { productId: 'eb-02', name: 'Monograph 02', price: 499 },
      ],
      subtotal: 998,
      total: 798, // 20% bundle discount
    }),
  });
  assert.equal(trackRes.status, 200);
  const trackData = await trackRes.json();

  // 2. Admin retrieves abandoned carts list
  const adminRes = await call(e, '/api/admin/abandoned', { headers: authed(cookie) });
  assert.equal(adminRes.status, 200);
  const adminData = await adminRes.json();
  assert.equal(adminData.list.length, 1);
  assert.equal(adminData.list[0].email, 'prospect@luxury.com');
  assert.equal(adminData.totalLostRevenue, 798);

  // 3. Admin sends recovery email
  const sendRes = await call(e, '/api/admin/abandoned/send', {
    method: 'POST',
    headers: authed(cookie, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: trackData.id }),
  });
  assert.equal(sendRes.status, 200);

  // Check emailSent flag updated
  const adminRes2 = await call(e, '/api/admin/abandoned', { headers: authed(cookie) });
  const adminData2 = await adminRes2.json();
  assert.equal(adminData2.list[0].emailSent, true);

  // 4. Customer subsequently completes payment -> marked recovered!
  await markCartRecovered(e, 'prospect@luxury.com');

  const adminRes3 = await call(e, '/api/admin/abandoned', { headers: authed(cookie) });
  const adminData3 = await adminRes3.json();
  assert.equal(adminData3.list[0].status, 'recovered');
  assert.equal(adminData3.recoveredCount, 1);
  assert.equal(adminData3.totalLostRevenue, 0); // recovered revenue is no longer lost
});


test('abandoned cart: names and prices come from the catalogue, never from the browser (no HTML injection)', async () => {
  const e = env();
  const cookie = await login(e);
  const r = await call(e, '/api/abandoned-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'victim@example.com', items: [{ productId: 'eb-01', name: '<b>FAKE</b>', price: '<a href="https://evil.example">Claim refund</a>' }] }),
  });
  const { id } = await r.json();
  const list = await (await call(e, '/api/admin/abandoned', { headers: authed(cookie) })).json();
  assert.equal(list.list[0].items[0].name, 'Monograph 01');
  assert.equal(list.list[0].items[0].price, 499);
  sentEmails.length = 0;
  await call(e, '/api/admin/abandoned/send', { method: 'POST', headers: authed(cookie, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id }) });
  assert.equal(sentEmails.length, 1);
  assert.ok(!sentEmails[0].body.htmlContent.includes('evil.example'));
});

test('abandoned cart: two emails that start the same get separate records', async () => {
  const e = env();
  const cookie = await login(e);
  for (const email of ['john.smith.work.24@gmail.com', 'john.smith.work.24@yahoo.com']) {
    await call(e, '/api/abandoned-cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, items: [{ productId: 'eb-01' }] }) });
  }
  const list = await (await call(e, '/api/admin/abandoned', { headers: authed(cookie) })).json();
  assert.equal(list.list.length, 2);
});

test('abandoned cart: not marked "emailed" when the email provider refuses', async () => {
  const e = env();
  const cookie = await login(e);
  const r = await call(e, '/api/abandoned-cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', items: [{ productId: 'eb-01' }] }) });
  const { id } = await r.json();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('no', { status: 401 });
  const send = await call(e, '/api/admin/abandoned/send', { method: 'POST', headers: authed(cookie, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id }) });
  globalThis.fetch = realFetch;
  assert.equal(send.status, 502);
  const list = await (await call(e, '/api/admin/abandoned', { headers: authed(cookie) })).json();
  assert.equal(list.list[0].emailSent, false);
});
