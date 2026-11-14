// Security regression tests (audit of 7 Nov 2026). Each test is a hole that was open before; keep them passing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';
import { hmacSha256Hex, itemsToNotes } from '../server/payments.js';
import { productSchema } from '../src/data/seo.js';
import { withSecurityHeaders } from '../server/security-headers.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 'https://shop.test';
const CATALOG = [
  { id: 'eb-onsale', slug: 'on-sale-book', name: 'On Sale Book', price: 299, status: 'on-sale', fileSize: 10, createdAt: 3 },
  { id: 'eb-pricey', slug: 'pricey-book', name: 'Pricey Book', price: 999, status: 'on-sale', fileSize: 20, createdAt: 2 },
  { id: 'eb-draft01', slug: 'secret-draft', name: 'Unreleased Draft', price: 499, status: 'draft', description: 'DRAFT TEXT', createdAt: 1,
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
  assert.equal((await call(e, '/api/coupon?code=SAMPLE10')).status, 404);
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
  const csp = html.headers.get('Content-Security-Policy');
  assert.match(csp, /frame-ancestors 'none'/);
  const scriptSrc = (csp.match(/script-src[^;]+/) || [''])[0];
  assert.ok(scriptSrc.includes("'self'"));
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'script-src must not allow unsafe-inline');
  const api = withSecurityHeaders(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  assert.equal(api.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('webhook: buyer cannot unlock extra books by tampering with payment notes', async () => {
  const webhookSecret = 'hook-secret-xyz';
  const e = env({
    RAZORPAY_KEY_ID: 'rzp_live_x',
    RAZORPAY_KEY_SECRET: 'rzp_sec_y',
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    BREVO_API_KEY: 'test_brevo'
  });

  // Razorpay order only contains eb-onsale (price 299, amount 29900)
  const orderNotes = { ...itemsToNotes([{ productId: 'eb-onsale', variant: 'PDF' }]), email: 'victim@gmail.com', phone: '+919876543210' };
  
  // Attacker puts extra book ('eb-pricey') and their own email in payment notes
  const paymentNotes = { ...itemsToNotes([{ productId: 'eb-onsale', variant: 'PDF' }, { productId: 'eb-pricey', variant: 'PDF' }]), email: 'attacker@evil.com' };

  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_tamper_1',
          order_id: 'order_honest_1',
          amount: 29900,
          notes: paymentNotes,
          email: 'attacker@evil.com'
        }
      }
    }
  };
  const bodyText = JSON.stringify(payload);
  const sig = await hmacSha256Hex(webhookSecret, bodyText);

  const mockFetch = async (url) => {
    if (String(url).includes('api.razorpay.com/v1/orders/order_honest_1')) {
      return new Response(JSON.stringify({
        id: 'order_honest_1',
        amount: 29900,
        notes: orderNotes
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('api.brevo.com')) {
      return new Response('{"messageId":"ok"}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const req = new Request(BASE + '/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: bodyText
  });
  const res = await route(req, e, mockFetch);
  assert.equal(res.status, 200);

  // Check fulfilled order in KV: ONLY eb-onsale must be fulfilled, and to victim@gmail.com
  const stored = await e.TAMYIZ_STORE.get('order-fulfilled:pay_tamper_1', 'json');
  assert.ok(stored);
  assert.equal(stored.items.length, 1);
  assert.equal(stored.items[0].productId, 'eb-onsale');
  assert.equal(stored.email, 'victim@gmail.com');
});

test('webhook: refuses payment if amount paid does not match order amount', async () => {
  const webhookSecret = 'hook-secret-xyz';
  const e = env({
    RAZORPAY_KEY_ID: 'rzp_live_x',
    RAZORPAY_KEY_SECRET: 'rzp_sec_y',
    RAZORPAY_WEBHOOK_SECRET: webhookSecret
  });

  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_underpay_1',
          order_id: 'order_underpay_1',
          amount: 9900, // Attacker paid ₹99
          notes: {}
        }
      }
    }
  };
  const bodyText = JSON.stringify(payload);
  const sig = await hmacSha256Hex(webhookSecret, bodyText);

  const mockFetch = async (url) => {
    if (String(url).includes('api.razorpay.com/v1/orders/order_underpay_1')) {
      return new Response(JSON.stringify({
        id: 'order_underpay_1',
        amount: 99900, // Order was ₹999
        notes: itemsToNotes([{ productId: 'eb-pricey', variant: 'PDF' }])
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const req = new Request(BASE + '/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: bodyText
  });
  const res = await route(req, e, mockFetch);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /amount does not match/);
});

test('verify-payment: uses order email from Razorpay, not browser-supplied email', async () => {
  const e = env({ RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'rzp-secret', BREVO_API_KEY: 'test_brevo' });
  const sig = await hmacSha256Hex('rzp-secret', 'order_123|pay_123');

  let sentTo = null;
  const mockFetch = async (url, opts) => {
    if (String(url).includes('api.razorpay.com/v1/payments/pay_123')) {
      return new Response(JSON.stringify({ id: 'pay_123', order_id: 'order_123', amount: 29900, status: 'captured' }), { status: 200 });
    }
    if (String(url).includes('api.razorpay.com/v1/orders/order_123')) {
      return new Response(JSON.stringify({
        id: 'order_123',
        amount: 29900,
        notes: { ...itemsToNotes([{ productId: 'eb-onsale', variant: 'PDF' }]), email: 'honest-buyer@gmail.com', phone: '+919876543210' }
      }), { status: 200 });
    }
    if (String(url).includes('api.brevo.com')) {
      const b = JSON.parse(opts.body);
      sentTo = b.to[0].email;
      return new Response('{"messageId":"ok"}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const res = await post(e, '/api/verify-payment', {
    razorpay_order_id: 'order_123',
    razorpay_payment_id: 'pay_123',
    razorpay_signature: sig,
    email: 'attacker@evil.com',
    phone: '+911111111111'
  }, {}, mockFetch);

  assert.equal(res.status, 200);
  const stored = await e.TAMYIZ_STORE.get('order-fulfilled:pay_123', 'json');
  assert.equal(stored.email, 'honest-buyer@gmail.com');
  assert.equal(sentTo, 'honest-buyer@gmail.com');
});

test('download: missing file returns 404 and does not increment download count', async () => {
  const e = env();
  const paymentId = 'pay_test_dl';
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = await hmacSha256Hex('test-secret', `dl|eb-onsale|${paymentId}|${exp}`);

  // No file:eb-onsale uploaded in KV
  const res = await call(e, `/api/download/eb-onsale?p=${paymentId}&e=${exp}&s=${sig}`);
  assert.equal(res.status, 404);

  // Counter must not be incremented
  const count = await e.TAMYIZ_STORE.get(`dl-count:${paymentId}:eb-onsale`);
  assert.equal(count, null);
});

test('recovery: recovers links via buyer-orders index even if order dropped off orders:index', async () => {
  const e = env({ BREVO_API_KEY: 'test_brevo' });
  const oldOrderId = 'order_old_vintage_999';
  const orderData = {
    orderId: oldOrderId,
    paymentId: 'pay_vintage_999',
    email: 'vintage@buyer.test',
    phone: '+919876543210',
    items: [{ productId: 'eb-onsale', name: 'On Sale Book', price: 299 }],
    status: 'paid'
  };
  await e.TAMYIZ_STORE.put(`order:${oldOrderId}`, JSON.stringify(orderData));
  await e.TAMYIZ_STORE.put('buyer-orders:vintage@buyer.test', JSON.stringify([oldOrderId]));
  // Notice orders:index is completely empty - order is NOT on the 500-order list
  await e.TAMYIZ_STORE.put('orders:index', JSON.stringify([]));

  let emailed = false;
  const mockFetch = async (url) => {
    if (String(url).includes('api.brevo.com')) {
      emailed = true;
      return new Response('{"messageId":"ok"}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const res = await post(e, '/api/recover-downloads', { email: 'vintage@buyer.test' }, {}, mockFetch);
  assert.equal(res.status, 200);
  assert.equal(emailed, true);
});

test('admin login: uses 0 KV writes on wrong passwords and supports stateless 6-digit Email OTP (2FA)', async () => {
  let kvWrites = 0;
  const baseKv = devKV();
  const countingKv = {
    get: (...args) => baseKv.get(...args),
    put: (...args) => { kvWrites++; return baseKv.put(...args); },
    delete: (...args) => baseKv.delete(...args),
    getWithMetadata: (...args) => baseKv.getWithMetadata(...args),
  };

  let capturedOtp = '';
  const mockFetch = async (url, opts) => {
    if (String(url).includes('api.brevo.com')) {
      const body = JSON.parse(opts.body);
      const match = body.subject.match(/^(\d{6})/);
      if (match) capturedOtp = match[1];
      return new Response('{"messageId":"otp-sent"}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const e = {
    TAMYIZ_STORE: countingKv,
    TAMYIZ_ADMIN_PASSWORD: 'super-secret-password-2026',
    ADMIN_OTP_EMAIL: 'tamyiz.co@gmail.com,sahilnaseer0123@gmail.com',
    BREVO_API_KEY: 'test_brevo_key',
  };

  // 1. Wrong password fails with 401 and 0 KV writes
  const wrongPass = await post(e, '/api/admin/login', { password: 'wrong' }, { 'CF-Connecting-IP': '10.0.0.1' }, mockFetch);
  assert.equal(wrongPass.status, 401);
  assert.equal(kvWrites, 0);

  // 2. Correct password triggers 6-digit OTP email and returns challenge (no Set-Cookie yet, 0 KV writes)
  const step1 = await post(e, '/api/admin/login', { password: 'super-secret-password-2026' }, { 'CF-Connecting-IP': '10.0.0.1' }, mockFetch);
  assert.equal(step1.status, 200);
  assert.equal(step1.headers.get('Set-Cookie'), null);
  const step1Data = await step1.json();
  assert.equal(step1Data.requiresOtp, true);
  assert.ok(step1Data.challenge);
  assert.match(capturedOtp, /^\d{6}$/);
  assert.equal(kvWrites, 0);

  // 3. Wrong 6-digit OTP is rejected with 401 (0 KV writes)
  const badOtp = await post(e, '/api/admin/login', {
    password: 'super-secret-password-2026',
    otp: '000000',
    challenge: step1Data.challenge,
  }, { 'CF-Connecting-IP': '10.0.0.1' }, mockFetch);
  assert.equal(badOtp.status, 401);
  assert.equal(kvWrites, 0);

  // 4. Correct 6-digit OTP issues the HttpOnly admin session cookie (0 KV writes)
  const step2 = await post(e, '/api/admin/login', {
    password: 'super-secret-password-2026',
    otp: capturedOtp,
    challenge: step1Data.challenge,
  }, { 'CF-Connecting-IP': '10.0.0.1' }, mockFetch);
  assert.equal(step2.status, 200);
  assert.ok(step2.headers.get('Set-Cookie')?.includes('tmz_admin='));
  assert.equal(kvWrites, 0);
});

test('webhook: refund.processed handles partial/full refunds idempotently, adjusts overview revenue, and revokes downloads/recovery', async () => {
  const webhookSecret = 'hook-refund-secret';
  let recoveryEmails = 0;
  const mockFetch = async (url) => {
    if (String(url).includes('api.brevo.com')) {
      recoveryEmails++;
      return new Response('{"messageId":"sent"}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const e = env({
    TAMYIZ_SANDBOX: 'true',
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    BREVO_API_KEY: 'test_brevo_key',
  });
  await e.TAMYIZ_STORE.put('file:eb-onsale', new Uint8Array([37, 80, 68, 70, 45]));

  // Complete a sandbox purchase so we have an order, download token, and buyer index
  const verifiedRes = await post(e, '/api/verify-payment', {
    items: [{ productId: 'eb-onsale', variant: 'PDF' }],
    email: 'refund-buyer@gmail.com',
    phone: '+919876543210',
  }, {}, mockFetch);
  assert.equal(verifiedRes.status, 200);
  const verified = await verifiedRes.json();
  const dlPath = new URL(verified.downloads[0].downloadUrl).pathname + new URL(verified.downloads[0].downloadUrl).search;
  assert.equal((await call(e, dlPath)).status, 200);

  const sendRefund = async (refundId, amountPaise, amountRefundedPaise, refundStatus) => {
    const bodyText = JSON.stringify({
      event: 'refund.processed',
      payload: {
        refund: { entity: { id: refundId, payment_id: verified.paymentId, amount: amountPaise } },
        payment: {
          entity: {
            id: verified.paymentId,
            order_id: verified.orderId,
            amount: 29900,
            amount_refunded: amountRefundedPaise,
            refund_status: refundStatus,
          },
        },
      },
    });
    const sig = await hmacSha256Hex(webhookSecret, bodyText);
    return call(e, '/api/webhook/razorpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
      body: bodyText,
    });
  };

  // 1. Partial refund (INR 100 of 299)
  const partialRes = await sendRefund('rfnd_part_1', 10000, 10000, 'partial');
  assert.equal(partialRes.status, 200);
  const partialData = await partialRes.json();
  assert.equal(partialData.status, 'refund_recorded');
  assert.equal(partialData.refundStatus, 'partial');

  // 2. Duplicate partial refund webhook is idempotent
  const dupRes = await sendRefund('rfnd_part_1', 10000, 10000, 'partial');
  assert.equal(dupRes.status, 200);
  assert.equal((await dupRes.json()).status, 'already_processed');

  // 3. Admin overview nets out the partial refund and still allows download
  const cookie = await login(e);
  const ov1 = await (await call(e, '/api/admin/overview', { headers: { Cookie: cookie } })).json();
  assert.equal(ov1.kpis.totalOrders, 1);
  assert.equal(ov1.kpis.totalRevenueINR, 199);
  assert.equal((await call(e, dlPath)).status, 200);

  // 4. Full refund revokes downloads, recovery email, and zeroes overview revenue/order count
  const fullRes = await sendRefund('rfnd_full_2', 19900, 29900, 'full');
  assert.equal(fullRes.status, 200);
  const fullData = await fullRes.json();
  assert.equal(fullData.status, 'refund_recorded');
  assert.equal(fullData.refundStatus, 'full');

  assert.equal((await call(e, dlPath)).status, 403);

  const emailsBeforeRecovery = recoveryEmails;
  const recRes = await post(e, '/api/recover-downloads', { email: 'refund-buyer@gmail.com' }, {}, mockFetch);
  assert.equal(recRes.status, 200);
  assert.equal(recoveryEmails, emailsBeforeRecovery);

  const ov2 = await (await call(e, '/api/admin/overview', { headers: { Cookie: cookie } })).json();
  assert.equal(ov2.kpis.totalRevenueINR, 0);
  assert.equal(ov2.kpis.totalCustomers, 0);
  assert.equal(ov2.bestSellers.find((b) => b.id === 'eb-onsale').sales, 0);
});

test('frontend: zero inline event handlers and public/_headers matches hardened CSP without unsafe-inline script-src', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const files = ['index.html', 'admin.html'];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk('src');

  const inlineHandlerRe = /\bon(?:click|change|submit|keydown|keyup|input|error|load|focus|blur|mousedown|mouseup|mouseover|mouseout)=/i;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!inlineHandlerRe.test(text), `Unexpected inline HTML event handler in ${file}`);
  }

  const headersFile = fs.readFileSync('public/_headers', 'utf8');
  const cspLine = headersFile.split('\n').find((l) => l.includes('Content-Security-Policy:')) || '';
  const scriptSrc = (cspLine.match(/script-src[^;]+/) || [''])[0];
  assert.ok(scriptSrc.includes("'self'"));
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'public/_headers script-src must not allow unsafe-inline');
});

test('site config: getSiteUrl/getSiteHost default & env.SITE_URL override propagate to receipts', async () => {
  const { getSiteUrl, getSiteHost } = await import('../server/site.js');
  const { receiptEmail } = await import('../server/payments.js');

  assert.equal(getSiteUrl({}), 'https://tamyiz.pages.dev');
  assert.equal(getSiteHost({}), 'tamyiz.pages.dev');
  assert.equal(getSiteUrl({ SITE_URL: 'https://tamyiz.in/' }), 'https://tamyiz.in');
  assert.equal(getSiteHost({ SITE_URL: 'https://tamyiz.in/' }), 'tamyiz.in');

  const receipt = receiptEmail({
    email: 'reader@example.com',
    referenceId: 'ORD-1',
    paymentId: 'pay_1',
    totalINR: 299,
    downloads: [{ name: 'Book', price: 299, downloadUrl: 'https://tamyiz.in/api/download/b1' }],
  }, { SITE_URL: 'https://tamyiz.in/' });

  assert.ok(receipt.html.includes('TAMYIZ (tamyiz.in)'));
  assert.ok(!receipt.html.includes('tamyiz.pages.dev'));
});

test('admin & app: lazy-loaded /admin, centralized SITE_URL, zero blocking alert/confirm or stale 10% copy', async () => {
  const fs = await import('node:fs');
  const adminCode = fs.readFileSync('src/scripts/pages/admin-page.js', 'utf8');
  const appCode = fs.readFileSync('src/scripts/tamyiz-unified-app.js', 'utf8');

  assert.ok(!/\b(?:alert|confirm)\s*\(/.test(adminCode), 'admin-page.js must use toast/confirm dialogs instead of blocking alert()/confirm()');
  assert.ok(!adminCode.includes('10% discount'), 'admin-page.js must not mention removed 10% recovery discount');
  assert.ok(!adminCode.includes('https://tamyiz.pages.dev'), 'admin-page.js must import SITE_URL instead of hardcoding domain');
  assert.ok(!/alert\s*\(\s*res\.error\b/.test(adminCode), 'admin-page.js must read res.data?.error on this.api() responses');

  assert.ok(!/import\s*\{[^}]*AdminController[^}]*\}\s*from/.test(appCode), 'tamyiz-unified-app.js must not statically import AdminController');
  assert.ok(/import\(\s*['"]\.\/pages\/admin-page\.js['"]\s*\)/.test(appCode), 'tamyiz-unified-app.js must dynamically import admin-page.js');
  assert.ok(/import\s*['"]\.\.\/\.\.\/styles\/admin\.css['"]/.test(adminCode), 'admin-page.js must lazy-import admin.css');
  assert.ok(!fs.existsSync('src/admin/admin.js'), 'obsolete legacy src/admin/admin.js should remain removed');

  const appMethods = new Set([...appCode.matchAll(/^  (?:async )?([a-zA-Z0-9_]+)\s*\(/gm)].map((m) => m[1]));
  const appProps = new Set([...appCode.matchAll(/this\.([a-zA-Z0-9_]+)\s*=/g)].map((m) => m[1]));
  const missingCalls = [...new Set([...appCode.matchAll(/this\.([a-zA-Z0-9_]+)\s*\(/g)].map((m) => m[1]))]
    .filter((name) => !appMethods.has(name) && !appProps.has(name));
  assert.deepEqual(missingCalls, [], `Missing this.<method>() definitions in tamyiz-unified-app.js: ${missingCalls.join(', ')}`);
  assert.ok(!appCode.includes(`html.includes('data-action="close-modal" aria-label=')`), 'openModalContent must match own close buttons even with intervening attributes/newlines');
});

test('sitemap.xml honors env.SITE_URL override', async () => {
  const { onRequestGet } = await import('../functions/sitemap.xml.js');
  const res = await onRequestGet({ env: { ...env(), SITE_URL: 'https://tamyiz.in/' } });
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.ok(xml.includes('<loc>https://tamyiz.in/</loc>'));
  assert.ok(!xml.includes('tamyiz.pages.dev'));
});

// ---- Audit of 14 Nov 2026: the password must never be the only thing that signs the cookie or the 2FA challenge ----

test('admin 2FA: knowing the password is not enough to work out the emailed code offline or to forge a cookie', async () => {
  const password = 'super-secret-password-2026';
  const e = {
    TAMYIZ_STORE: devKV(),
    TAMYIZ_ADMIN_PASSWORD: password,
    ADMIN_OTP_EMAIL: 'owner@example.com',
    BREVO_API_KEY: 'brevo-key',
    ADMIN_SESSION_SECRET: 'long-random-server-only-text',
  };
  const mockFetch = async () => new Response('{}', { status: 201 });
  const ip = { 'CF-Connecting-IP': '10.9.9.9' };

  const step1 = await (await post(e, '/api/admin/login', { password }, ip, mockFetch)).json();
  const [exp, sig] = step1.challenge.split('.');

  // The old attack: sign every possible code with the password and compare. It must find nothing now.
  // (Checks a window around the real code range; the real fix is that the key is not derivable from the password.)
  let recovered = null;
  for (let code = 100000; code < 100400; code++) {
    if (await hmacSha256Hex(password, `admin-otp|${exp}|10.9.9.9|${code}`) === sig) recovered = code;
  }
  assert.equal(recovered, null);

  // The old forged cookie: HMAC of the expiry, keyed with the password only. Must be refused.
  const future = Math.floor(Date.now() / 1000) + 3600;
  const forged = `${future}.${await hmacSha256Hex(password, `admin|${future}`)}`;
  assert.equal((await call(e, '/api/admin/session', { headers: { Cookie: `tmz_admin=${forged}` } })).status, 401);
});

test('admin session: a cookie from a real login still works, and changing the server secret logs everyone out', async () => {
  const base = { TAMYIZ_STORE: devKV(), TAMYIZ_ADMIN_PASSWORD: 'super-secret-password-2026', ADMIN_SESSION_SECRET: 'secret-one' };
  const r = await post(base, '/api/admin/login', { password: 'super-secret-password-2026' });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await call(base, '/api/admin/session', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await call({ ...base, ADMIN_SESSION_SECRET: 'secret-two' }, '/api/admin/session', { headers: { Cookie: cookie } })).status, 401);
});

test('admin session: with no ADMIN_SESSION_SECRET another server secret is used, never the password alone', async () => {
  const password = 'super-secret-password-2026';
  const e = { TAMYIZ_STORE: devKV(), TAMYIZ_ADMIN_PASSWORD: password, RAZORPAY_KEY_SECRET: 'rzp-secret' };
  const future = Math.floor(Date.now() / 1000) + 3600;
  const forged = `${future}.${await hmacSha256Hex(password, `admin|${future}`)}`;
  assert.equal((await call(e, '/api/admin/session', { headers: { Cookie: `tmz_admin=${forged}` } })).status, 401);
  const r = await post(e, '/api/admin/login', { password });
  assert.equal((await call(e, '/api/admin/session', { headers: { Cookie: r.headers.get('Set-Cookie').split(';')[0] } })).status, 200);
});

test('downloads: links signed with RAZORPAY_KEY_SECRET keep working after DOWNLOAD_SECRET is added', async () => {
  const { checkDownload, signDownload } = await import('../server/payments.js');
  const oldEnv = { RAZORPAY_KEY_SECRET: 'rzp-secret' };
  const oldLink = new URL('https://x.test' + (await signDownload(oldEnv, 'eb-onsale', 'pay_1')));
  const newEnv = { RAZORPAY_KEY_SECRET: 'rzp-secret', DOWNLOAD_SECRET: 'fresh-download-secret' };
  const q = oldLink.searchParams;
  assert.equal(await checkDownload(newEnv, 'eb-onsale', q.get('p'), q.get('e'), q.get('s')), true);
  // New links use the new secret, and a link for another book or a bad signature is still refused.
  const newLink = new URL('https://x.test' + (await signDownload(newEnv, 'eb-onsale', 'pay_2')));
  const n = newLink.searchParams;
  assert.equal(await checkDownload(newEnv, 'eb-onsale', n.get('p'), n.get('e'), n.get('s')), true);
  assert.equal(await checkDownload({ RAZORPAY_KEY_SECRET: 'rzp-secret' }, 'eb-onsale', n.get('p'), n.get('e'), n.get('s')), false);
  assert.equal(await checkDownload(newEnv, 'eb-pricey', q.get('p'), q.get('e'), q.get('s')), false);
});

test('admin 2FA: OTP challenge is single-use and OTP requests are rate limited per IP', async () => {
  let capturedOtp = '';
  let emailsSent = 0;
  const mockFetch = async (url, opts) => {
    if (String(url).includes('api.brevo.com')) {
      emailsSent++;
      const m = JSON.parse(opts.body).subject.match(/^(\d{6})/);
      if (m) capturedOtp = m[1];
      return new Response('{"messageId":"ok"}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };

  const e = {
    TAMYIZ_STORE: devKV(),
    TAMYIZ_ADMIN_PASSWORD: 'super-secret-password-2026',
    ADMIN_OTP_EMAIL: 'owner@example.com',
    BREVO_API_KEY: 'test_brevo_key',
    ADMIN_SESSION_SECRET: 'long-random-session-secret-key',
  };
  const ip = { 'CF-Connecting-IP': '10.22.33.44' };

  const c1 = await (await post(e, '/api/admin/login', { password: e.TAMYIZ_ADMIN_PASSWORD }, ip, mockFetch)).json();
  const code1 = capturedOtp;
  // First valid use succeeds
  const ok1 = await post(e, '/api/admin/login', { password: e.TAMYIZ_ADMIN_PASSWORD, otp: code1, challenge: c1.challenge }, ip, mockFetch);
  assert.equal(ok1.status, 200);
  // Replay of same challenge + OTP is refused
  const replay = await post(e, '/api/admin/login', { password: e.TAMYIZ_ADMIN_PASSWORD, otp: code1, challenge: c1.challenge }, ip, mockFetch);
  assert.equal(replay.status, 401);

  // Max 4 OTP sends per IP (already sent 1; send 3 more, 5th returns 429)
  for (let i = 0; i < 3; i++) {
    const r = await post(e, '/api/admin/login', { password: e.TAMYIZ_ADMIN_PASSWORD }, ip, mockFetch);
    assert.equal(r.status, 200);
  }
  const throttled = await post(e, '/api/admin/login', { password: e.TAMYIZ_ADMIN_PASSWORD }, ip, mockFetch);
  assert.equal(throttled.status, 429);
  assert.equal(emailsSent, 4);
});

test('KV exhaustion defense: GET /api/coupon uses 0 KV writes and invalid public POST payloads spend 0 KV writes', async () => {
  let kvWrites = 0;
  const baseKv = devKV();
  const countingKv = {
    get: (...args) => baseKv.get(...args),
    put: (...args) => { kvWrites++; return baseKv.put(...args); },
    delete: (...args) => baseKv.delete(...args),
    getWithMetadata: (...args) => baseKv.getWithMetadata(...args),
  };
  const e = { TAMYIZ_STORE: countingKv };

  // Malformed / prototype coupon probes return 404 with 0 writes
  for (const badCode of ['', 'x', '__proto__', 'constructor', 'toString']) {
    const res = await call(e, `/api/coupon?code=${encodeURIComponent(badCode)}`, { headers: { 'CF-Connecting-IP': '198.51.100.7' } });
    assert.equal(res.status, 404);
  }
  // Brute-force coupon checks throttle at 429 using in-memory limiter (still 0 KV writes)
  for (let i = 0; i < 30; i++) {
    const r = await call(e, `/api/coupon?code=GUESS${i}`, { headers: { 'CF-Connecting-IP': '198.51.100.8' } });
    assert.equal(r.status, 404);
  }
  const couponThrottled = await call(e, '/api/coupon?code=GUESS99', { headers: { 'CF-Connecting-IP': '198.51.100.8' } });
  assert.equal(couponThrottled.status, 429);

  // Invalid POST payloads on sample, reviews, abandoned-cart, and recover-downloads fail with 400 & 0 KV writes
  const badIp = { 'CF-Connecting-IP': '198.51.100.9' };
  assert.equal((await post(e, '/api/sample', { email: 'not-an-email', productId: 'eb-1' }, badIp)).status, 400);
  assert.equal((await post(e, '/api/reviews', { email: 'bad', name: 'X', rating: 5, comment: 'short' }, badIp)).status, 400);
  assert.equal((await post(e, '/api/abandoned-cart', { email: 'bad', items: [] }, badIp)).status, 400);
  assert.equal((await post(e, '/api/recover-downloads', { email: 'bad email@x.com' }, badIp)).status, 400);
  assert.equal(kvWrites, 0);
});

test('payment currency & refund lock: non-INR Razorpay payment is refused and refunded order ID blocks download', async () => {
  const e = env({ RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'rzp-secret', DOWNLOAD_SECRET: 'dl-sec' });
  const sig = await hmacSha256Hex('rzp-secret', 'order_usd_1|pay_usd_1');
  const mockFetch = async (url) => {
    if (String(url).includes('/payments/')) {
      return new Response(JSON.stringify({ id: 'pay_usd_1', order_id: 'order_usd_1', amount: 29900, currency: 'USD', status: 'captured' }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 'order_usd_1',
      amount: 29900,
      currency: 'USD',
      notes: { ...itemsToNotes([{ productId: 'eb-onsale', variant: 'PDF' }]), email: 'u@example.com', phone: '+919876543210' }
    }), { status: 200 });
  };
  const badCur = await post(e, '/api/verify-payment', {
    razorpay_order_id: 'order_usd_1',
    razorpay_payment_id: 'pay_usd_1',
    razorpay_signature: sig,
  }, {}, mockFetch);
  assert.equal(badCur.status, 400);

  // Order marked refunded in order:<id> (without order-fulfilled:<id>) also blocks signed download links referencing that ID
  const { signDownload } = await import('../server/payments.js');
  await e.TAMYIZ_STORE.put('file:eb-onsale', new Uint8Array([37, 80, 68, 70, 45]));
  await e.TAMYIZ_STORE.put('order:gift_refunded_1', JSON.stringify({ orderId: 'gift_refunded_1', status: 'refunded' }));
  const dlLink = await signDownload(e, 'eb-onsale', 'gift_refunded_1');
  assert.equal((await call(e, dlLink)).status, 403);
});

test('in-memory rate limiting: all /api/* public limits and global burst guard enforce 429 with 0 rate-limit KV writes', async () => {
  const writtenKeys = [];
  const base = env({
    BREVO_API_KEY: 'brevo-test',
    RAZORPAY_KEY_ID: 'rzp_live_test',
    RAZORPAY_KEY_SECRET: 'rzp_secret_test',
    RAZORPAY_WEBHOOK_SECRET: 'rzp_wh_test',
  });
  const baseKv = base.TAMYIZ_STORE;
  const trackingKv = {
    get: (...args) => baseKv.get(...args),
    put: (k, ...rest) => { writtenKeys.push(k); return baseKv.put(k, ...rest); },
    delete: (...args) => baseKv.delete(...args),
    getWithMetadata: (...args) => baseKv.getWithMetadata(...args),
  };
  const e = { ...base, TAMYIZ_STORE: trackingKv };
  const mockFetch = async (url) => {
    if (String(url).includes('api.razorpay.com')) {
      return new Response(JSON.stringify({ id: 'order_rate_1', amount: 29900, currency: 'INR' }), { status: 200 });
    }
    return new Response('{}', { status: 201 });
  };

  // 1. /api/sample: 10 allowed, 11th -> 429
  for (let i = 0; i < 10; i++) {
    const r = await post(e, '/api/sample', { productId: 'eb-onsale', email: 'sample@example.com' }, { 'CF-Connecting-IP': '198.51.100.11' }, mockFetch);
    assert.equal(r.status, 200);
  }
  assert.equal((await post(e, '/api/sample', { productId: 'eb-onsale', email: 'sample@example.com' }, { 'CF-Connecting-IP': '198.51.100.11' }, mockFetch)).status, 429);

  // 2. /api/recover-downloads: 8 allowed, 9th -> 429
  for (let i = 0; i < 8; i++) {
    const r = await post(e, '/api/recover-downloads', { email: 'buyer@example.com' }, { 'CF-Connecting-IP': '198.51.100.12' }, mockFetch);
    assert.equal(r.status, 200);
  }
  assert.equal((await post(e, '/api/recover-downloads', { email: 'buyer@example.com' }, { 'CF-Connecting-IP': '198.51.100.12' }, mockFetch)).status, 429);

  // 3. /api/reviews: 5 allowed, 6th -> 429
  for (let i = 0; i < 5; i++) {
    const r = await post(e, '/api/reviews', { productId: 'eb-onsale', name: 'Reader', email: 'r@example.com', rating: 5, comment: 'Clear and thoughtful.' }, { 'CF-Connecting-IP': '198.51.100.13' }, mockFetch);
    assert.equal(r.status, 200);
  }
  assert.equal((await post(e, '/api/reviews', { productId: 'eb-onsale', name: 'Reader', email: 'r@example.com', rating: 5, comment: 'Clear and thoughtful.' }, { 'CF-Connecting-IP': '198.51.100.13' }, mockFetch)).status, 429);

  // 4. /api/abandoned-cart: 20 allowed, 21st -> { ok: true, rateLimited: true }
  for (let i = 0; i < 20; i++) {
    const r = await post(e, '/api/abandoned-cart', { email: 'ab@example.com', items: [{ productId: 'eb-onsale', variant: 'PDF' }] }, { 'CF-Connecting-IP': '198.51.100.14' }, mockFetch);
    assert.equal(r.status, 200);
  }
  const abLimited = await (await post(e, '/api/abandoned-cart', { email: 'ab@example.com', items: [{ productId: 'eb-onsale', variant: 'PDF' }] }, { 'CF-Connecting-IP': '198.51.100.14' }, mockFetch)).json();
  assert.equal(abLimited.rateLimited, true);

  // 5. /api/create-order: 20 allowed, 21st -> 429
  const orderBody = { items: [{ productId: 'eb-onsale', variant: 'PDF' }], email: 'buyer@example.com', phone: '+919876543210' };
  for (let i = 0; i < 20; i++) {
    const r = await post(e, '/api/create-order', orderBody, { 'CF-Connecting-IP': '198.51.100.15' }, mockFetch);
    assert.equal(r.status, 200);
  }
  assert.equal((await post(e, '/api/create-order', orderBody, { 'CF-Connecting-IP': '198.51.100.15' }, mockFetch)).status, 429);

  // 6. Global /api/* burst limiter: 180 req/min allowed, 181st -> 429 (webhooks excluded)
  const writesBeforeBurst = writtenKeys.length;
  for (let i = 0; i < 180; i++) {
    const r = await call(e, '/api/announcement', { headers: { 'CF-Connecting-IP': '198.51.100.250' } });
    assert.equal(r.status, 200);
  }
  assert.equal((await call(e, '/api/announcement', { headers: { 'CF-Connecting-IP': '198.51.100.250' } })).status, 429);
  const wh = await post(e, '/api/webhook/razorpay', { event: 'payment.captured' }, { 'CF-Connecting-IP': '198.51.100.250' });
  assert.notEqual(wh.status, 429);
  assert.equal(writtenKeys.length, writesBeforeBurst);

  // Zero rate-limit counters written to KV across all endpoints
  assert.deepEqual(
    writtenKeys.filter((k) => k.includes('-rate:') || k.startsWith('recover-email:')),
    []
  );
});
