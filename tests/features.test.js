import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';
import { calculateOrderTotal, VALID_COUPONS } from '../server/payments.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 'https://shop.test';
const env = (extra = {}) => ({ TAMYIZ_STORE: devKV(), ADMIN_PASSWORD: PASSWORD, DOWNLOAD_SECRET: 'test-signing-secret', ...extra });
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

async function addEbook(e, cookie, name, price = '499') {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name,
    price,
    status: 'on-sale',
    description: `Description of ${name}`,
  })) {
    f.append(k, v);
  }
  f.append('pdf', new Blob([PDF]), 'book.pdf');
  const res = await call(e, '/api/admin/products', { method: 'POST', headers: authed(cookie), body: f });
  return (await res.json()).product;
}

// ---------------------------------------------------------------------------
// FEATURE 1: Bundle Discounts & Automatic Tiered Savings
// ---------------------------------------------------------------------------
test('bundle discounts: 2 books get 20% off, 3 books get 25% off', async () => {
  const catalog = [
    { id: 'b1', name: 'Book 1', price: 1000, status: 'on-sale' },
    { id: 'b2', name: 'Book 2', price: 1000, status: 'on-sale' },
    { id: 'b3', name: 'Book 3', price: 1000, status: 'on-sale' },
  ];

  // 1 book: no bundle discount
  const single = calculateOrderTotal([{ productId: 'b1' }], null, catalog);
  assert.equal(single.bundleDiscount, 0);
  assert.equal(single.total, 1000);

  // 2 books: 20% off subtotal (2000 - 400 = 1600)
  const duo = calculateOrderTotal([{ productId: 'b1' }, { productId: 'b2' }], null, catalog);
  assert.equal(duo.subtotal, 2000);
  assert.equal(duo.bundleDiscount, 400);
  assert.equal(duo.total, 1600);

  // 3 books: 25% off subtotal (3000 - 750 = 2250)
  const trio = calculateOrderTotal([{ productId: 'b1' }, { productId: 'b2' }, { productId: 'b3' }], null, catalog);
  assert.equal(trio.subtotal, 3000);
  assert.equal(trio.bundleDiscount, 750);
  assert.equal(trio.total, 2250);

  // Welcome coupon SAMPLE10 stacks 10% on remaining
  const withCoupon = calculateOrderTotal([{ productId: 'b1' }, { productId: 'b2' }], 'SAMPLE10', catalog);
  assert.equal(withCoupon.bundleDiscount, 400);
  assert.equal(withCoupon.couponDiscount, 160); // 10% of 1600
  assert.equal(withCoupon.total, 1440);
});

// ---------------------------------------------------------------------------
// FEATURE 2: Customer Download Recovery (/api/recover-downloads)
// ---------------------------------------------------------------------------
test('customer download recovery: rejects invalid inputs', async () => {
  const e = env();
  const res = await call(e, '/api/recover-downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bad-email' }),
  });
  assert.equal(res.status, 400);
});

// Fake Brevo: records every email "sent".
const sentEmails = [];
const fakeBrevo = async (url, opts = {}) => {
  sentEmails.push({ url: String(url), body: JSON.parse(opts.body || '{}') });
  return new Response('{}', { status: 201 });
};
const callWithMail = (e, path, opts = {}) => route(new Request(BASE + path, opts), e, fakeBrevo);

test('customer download recovery: same answer whether or not a purchase exists (no lookup of who bought what)', async () => {
  const e = env({ BREVO_API_KEY: 'test' });
  sentEmails.length = 0;
  const res = await callWithMail(e, '/api/recover-downloads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer@example.com' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.books, undefined);
  assert.equal(sentEmails.length, 0);
});

test('customer download recovery: links are only emailed to the order email, never shown on screen', async () => {
  const e = env({ BREVO_API_KEY: 'test' });
  const cookie = await login(e);
  const book = await addEbook(e, cookie, 'Monograph on Architectural Silence', '499');

  const orderRes = await call(e, '/api/admin/orders/gift', {
    method: 'POST',
    headers: authed(cookie, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: 'verified.buyer@test.com', phone: '+919876543210', productId: book.id, note: 'VIP Reviewer' }),
  });
  assert.equal(orderRes.status, 200);

  for (const lookup of [{ email: 'verified.buyer@test.com' }, { phone: '+91 98765 43210' }]) {
    sentEmails.length = 0;
    const r = await callWithMail(e, '/api/recover-downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lookup),
    });
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.ok(!text.includes('/api/download/'), 'no download link in the response');
    assert.ok(!text.includes('verified.buyer'), 'no email in the response');
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].body.to[0].email, 'verified.buyer@test.com');
    // The emailed link works.
    const link = sentEmails[0].body.textContent.match(/https:\/\/shop\.test(\/api\/download\/[^\s]+)/)[1];
    const dl = await call(e, link);
    assert.equal(dl.status, 200);
    assert.equal(dl.headers.get('Content-Type'), 'application/pdf');
  }

  // Part of a phone number is not enough.
  sentEmails.length = 0;
  await callWithMail(e, '/api/recover-downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '76543210' }) });
  assert.equal(sentEmails.length, 0);
});

test('customer download recovery: honest error when email is not set up', async () => {
  const e = env();
  const res = await call(e, '/api/recover-downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co' }) });
  assert.equal(res.status, 503);
});

// ---------------------------------------------------------------------------
// FEATURE 3: Reader Reviews Submission & Admin Moderation
// ---------------------------------------------------------------------------
test('reader reviews: submit, check moderation, and approve for storefront', async () => {
  const e = env();
  const cookie = await login(e);
  const book = await addEbook(e, cookie, 'Editorial Systems 101', '399');

  // 1. Submit review
  const subRes = await call(e, '/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: book.id,
      name: 'Sahil',
      email: 'sahil@example.com',
      rating: 5,
      comment: 'An uncompromisingly structured monograph. Tremendous clarity.',
    }),
  });
  assert.equal(subRes.status, 200);
  const subData = await subRes.json();
  assert.equal(subData.ok, true);

  // 2. Unapproved reviews should NOT appear on public endpoint yet
  const pubRes1 = await call(e, `/api/reviews?product=${book.id}`);
  assert.equal(pubRes1.status, 200);
  const pubData1 = await pubRes1.json();
  assert.equal(pubData1.reviews.length, 0);

  // 3. Admin views pending reviews
  const adminRevRes = await call(e, '/api/admin/reviews', { headers: authed(cookie) });
  assert.equal(adminRevRes.status, 200);
  const adminRevData = await adminRevRes.json();
  assert.equal(adminRevData.pending.length, 1);
  assert.equal(adminRevData.pending[0].id, subData.reviewId);

  // 4. Admin approves review
  const approveRes = await call(e, `/api/admin/reviews/${subData.reviewId}/approve`, {
    method: 'POST',
    headers: authed(cookie),
  });
  assert.equal(approveRes.status, 200);

  // 5. Approved review now appears on public endpoint!
  const pubRes2 = await call(e, `/api/reviews?product=${book.id}`);
  const pubData2 = await pubRes2.json();
  assert.equal(pubData2.reviews.length, 1);
  assert.equal(pubData2.reviews[0].comment, 'An uncompromisingly structured monograph. Tremendous clarity.');
  assert.equal(pubData2.averageRating, 5);
});
