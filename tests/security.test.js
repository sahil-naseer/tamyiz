// Security regression tests (audit of 7 Nov 2026). Each test is a hole that was open before; keep them passing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';
import { hmacSha256Hex } from '../server/payments.js';
import { productSchema } from '../src/data/seo.js';
import { withSecurityHeaders } from '../server/security-headers.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 'https://shop.test';
const CATALOG = [
  { id: 'eb-onsale', slug: 'on-sale-book', name: 'On Sale Book', price: 299, status: 'on-sale', fileSize: 10, createdAt: 3 },
  { id: 'eb-draft01', slug: 'secret-draft', name: 'Unreleased Draft', price: 499, status: 'draft', description: 'DRAFT TEXT', createdAt: 2,
    sampleExcerpt: { chapter: 'Ch 1', subtitle: 's', text: 'UNRELEASED CHAPTER' } },
];
const env = (extra = {}) => {
  const kv = devKV();
  kv.put('products', JSON.stringify(CATALOG));
  return { TAMYIZ_STORE: kv, ADMIN_PASSWORD: PASSWORD, DOWNLOAD_SECRET: 'test-secret', ...extra };
};
const call = (e, path, opts = {}, f) => route(new Request(BASE + path, opts), e, f);
const post = (e, path, body, headers = {}, f) =>
  call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, f);

async function login(e) {
  const r = await post(e, '/api/admin/login', { password: PASSWORD });
  return r.headers.get('Set-Cookie').split(';')[0];
}

test('verify-payment: a payment ID alone (no valid signature) returns no buyer details or links', async () => {
  const e = env({ RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'rzp-secret' });
  const order = { orderId: 'order_A', paymentId: 'pay_REAL', email: 'buyer@gmail.com', phone: '+919876543210', items: [{ productId: 'eb-onsale', name: 'On Sale Book', price: 299 }], status: 'paid' };
  await e.TAMYIZ_STORE.put('order-fulfilled:pay_REAL', JSON.stringify(order));

  for (const body of [{ razorpay_payment_id: 'pay_REAL' }, { razorpay_payment_id: 'pay_REAL', razorpay_order_id: 'order_A', razorpay_signature: 'f'.repeat(64) }]) {
    const r = await post(e, '/api/verify-payment', body);
    const text = await r.text();
    assert.equal(r.status, 400);
    assert.ok(!text.includes('buyer@gmail.com'));
    assert.ok(!text.includes('/api/download/'));
  }

  // With the genuine signature the buyer still gets their order back (page refresh after paying).
  const sig = await hmacSha256Hex('rzp-secret', 'order_A|pay_REAL');
  const ok = await post(e, '/api/verify-payment', { razorpay_payment_id: 'pay_REAL', razorpay_order_id: 'order_A', razorpay_signature: sig });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).alreadyFulfilled, true);
});

test('reviews: the public list never contains reviewer emails, and no reviews means no rating', async () => {
  const e = env();
  let r = await call(e, '/api/reviews?product=eb-onsale');
  let d = await r.json();
  assert.equal(d.count, 0);
  assert.equal(d.averageRating, null);

  await e.TAMYIZ_STORE.put('store:reviews:approved', JSON.stringify([
    { id: 'rev_1', productId: 'eb-onsale', name: 'Asha', email: 'asha.private@gmail.com', rating: 4, comment: 'Useful and clear.' },
  ]));
  r = await call(e, '/api/reviews?product=eb-onsale');
  const text = await r.text();
  assert.ok(!text.includes('asha.private'));
  assert.equal(JSON.parse(text).averageRating, 4);
});

test('reviews: rejected for drafts, unknown books and oversized ids', async () => {
  const e = env();
  const base = { name: 'Reader', email: 'r@example.com', rating: 5, comment: 'A real review of the book.' };
  for (const productId of ['eb-draft01', 'no-such-book', 'x'.repeat(5000)]) {
    const r = await post(e, '/api/reviews', { ...base, productId });
    assert.notEqual(r.status, 200, productId.slice(0, 20));
  }
  const ok = await post(e, '/api/reviews', { ...base, productId: 'eb-onsale' });
  assert.equal(ok.status, 200);
});

test('sample: draft books are never revealed, even by guessing the slug', async () => {
  const e = env();
  for (const productId of ['eb-draft01', 'secret-draft']) {
    const r = await post(e, '/api/sample', { productId, email: 'x@example.com' });
    assert.equal(r.status, 404);
    assert.ok(!(await r.text()).includes('UNRELEASED'));
  }
});

test('sample: leads no longer store IP address or device; one welcome email per address', async () => {
  const sent = [];
  const fakeMail = async (url, opts) => { sent.push(JSON.parse(opts.body)); return new Response('{}', { status: 201 }); };
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeMail; // sendSampleWelcomeEmail uses the global fetch
  try {
    const e = env({ BREVO_API_KEY: 'k' });
    for (let i = 0; i < 3; i++) await post(e, '/api/sample', { productId: 'eb-onsale', email: 'reader@example.com' }, { 'CF-Connecting-IP': `9.9.9.${i}` });
    assert.equal(sent.length, 1);
    const idx = JSON.parse(await e.TAMYIZ_STORE.get('store:leads:index'));
    const lead = JSON.parse(await e.TAMYIZ_STORE.get(`store:lead:${idx[0].id}`));
    assert.equal(lead.ip, undefined);
    assert.equal(lead.userAgent, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('admin: logout without a valid session does not sign the admin out', async () => {
  const e = env();
  const cookie = await login(e);
  const r = await post(e, '/api/admin/logout', {});
  assert.equal(r.status, 200);
  assert.equal(await e.TAMYIZ_STORE.get('admin:revoked_before'), null);
  const still = await call(e, '/api/admin/session', { headers: { Cookie: cookie } });
  assert.equal(still.status, 200);
});

test('admin: announcement banner refuses javascript: links', async () => {
  const e = env();
  const cookie = await login(e);
  const r = await post(e, '/api/admin/announcement', { enabled: true, text: 'Hi', link: 'javascript:alert(1)' }, { Cookie: cookie, 'X-Tamyiz-Admin': '1' });
  assert.equal((await r.json()).announcement.link, '');
});

test('coupons: coupons made on /admin are accepted by GET /api/coupon (the bag uses it)', async () => {
  const e = env();
  const cookie = await login(e);
  await post(e, '/api/admin/coupons', { code: 'diwali25', type: 'percent', value: 25 }, { Cookie: cookie, 'X-Tamyiz-Admin': '1' });
  const ok = await (await call(e, '/api/coupon?code=DIWALI25')).json();
  assert.equal(ok.valid, true);
  assert.equal(ok.coupon.value, 25);
  assert.equal((await call(e, '/api/coupon?code=SAMPLE10')).status, 200);
  assert.equal((await call(e, '/api/coupon?code=NOPE')).status, 404);
});

test('SEO: no made-up aggregateRating in the book structured data', () => {
  const schema = productSchema({ name: 'Book', slug: 'book', price: 199, available: true, images: [] });
  assert.equal(schema.aggregateRating, undefined);
  const real = productSchema({ name: 'Book', slug: 'book', price: 199, available: true, images: [], reviewCount: 3, ratingValue: 4.7 });
  assert.equal(real.aggregateRating.reviewCount, '3');
});

test('headers: Functions responses get the security headers (_headers does not cover them)', async () => {
  const html = withSecurityHeaders(new Response('<p>x</p>', { headers: { 'Content-Type': 'text/html' } }));
  assert.equal(html.headers.get('X-Frame-Options'), 'DENY');
  assert.match(html.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  const api = withSecurityHeaders(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  assert.equal(api.headers.get('X-Content-Type-Options'), 'nosniff');
});
