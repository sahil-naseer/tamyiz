// Payment and download security tests: run with `npm test`. Razorpay is faked with a stub fetch; KV with devKV().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleCreateOrder, handleVerifyPayment, handleRazorpayWebhook, hmacSha256Hex, timingSafeEqual,
  itemsToNotes, notesToItems, calculateOrderTotal, VALID_COUPONS, MAX_DOWNLOADS,
} from '../server/payments.js';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';

// The shop has no public promo codes; tests use their own.
VALID_COUPONS.TESTCODE15 = { type: 'percent', value: 15 };

const post = (body) => new Request('https://shop.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const buyer = { email: 'a@b.co', phone: '9876543210' };
const KEYS = { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'shh-secret' };
const PDF = new TextEncoder().encode('%PDF-1.7\nfake ebook bytes');

/** A shop with one e-book on sale (₹299) and one coming soon (₹999). */
async function shop(extra = {}) {
  const kv = devKV();
  const now = Date.now();
  await kv.put('products', JSON.stringify([
    { id: 'eb-onsale1', slug: 'research-with-ai', name: 'Research, Write & Cite with AI', price: 299, status: 'on-sale', fileSize: PDF.length, createdAt: now, updatedAt: now },
    { id: 'eb-soon0002', slug: 'next-book', name: 'Next Book', price: 999, status: 'soon', createdAt: now - 1, updatedAt: now },
  ]));
  await kv.put('file:eb-onsale1', PDF, { metadata: { type: 'application/pdf', size: PDF.length } });
  return { TAMYIZ_STORE: kv, ...extra };
}
const cart = [{ productId: 'eb-onsale1', variant: 'PDF' }];

function fakeRazorpay() {
  const orders = {}, payments = {};
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/v1/orders') && init.method === 'POST') {
      const b = JSON.parse(init.body);
      const id = 'order_' + (Object.keys(orders).length + 1);
      orders[id] = { id, amount: b.amount, notes: b.notes, status: 'created' };
      return Response.json(orders[id]);
    }
    let m = u.match(/\/v1\/orders\/(.+)$/);
    if (m) return orders[m[1]] ? Response.json(orders[m[1]]) : new Response('{}', { status: 404 });
    m = u.match(/\/v1\/payments\/(.+)$/);
    if (m) return payments[m[1]] ? Response.json(payments[m[1]]) : new Response('{}', { status: 404 });
    return new Response('{}', { status: 404 });
  };
  return { orders, payments, fetchImpl };
}

async function paidOrder(env, rz, items = cart, coupon) {
  const o = await (await handleCreateOrder(post({ items, ...buyer, couponCode: coupon }), env, rz.fetchImpl)).json();
  rz.payments.pay_1 = { id: 'pay_1', order_id: o.orderId, status: 'captured', amount: o.amount };
  const sig = await hmacSha256Hex(KEYS.RAZORPAY_KEY_SECRET, `${o.orderId}|pay_1`);
  return { o, verify: post({ razorpay_order_id: o.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: sig, ...buyer }) };
}

test('no keys and no sandbox: checkout is refused with a clear message (no free downloads)', async () => {
  const env = await shop();
  const r = await handleCreateOrder(post({ items: cart, ...buyer }), env);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /WhatsApp/);
  assert.equal((await handleVerifyPayment(post({ mode: 'atelier_sandbox', items: cart, ...buyer }), env)).status, 503);
});

test('with real keys, a browser claiming "sandbox" mode gets nothing', async () => {
  const v = await handleVerifyPayment(post({ mode: 'atelier_sandbox', items: cart, ...buyer }), await shop(KEYS), fakeRazorpay().fetchImpl);
  assert.equal(v.status, 400);
});

test('a forged signature is rejected', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { o } = await paidOrder(env, rz);
  const v = await handleVerifyPayment(post({ razorpay_order_id: o.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'nope', ...buyer }), env, rz.fetchImpl);
  assert.equal(v.status, 400);
});

test('a real payment unlocks exactly what was ordered, and the download link works', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { o, verify } = await paidOrder(env, rz);
  assert.equal(o.amount, 29900);
  const res = await (await handleVerifyPayment(verify, env, rz.fetchImpl)).json();
  assert.equal(res.verified, true);
  assert.deepEqual(res.downloads.map((d) => d.productId), ['eb-onsale1']);
  const link = new URL(res.downloads[0].downloadUrl);
  assert.equal(link.origin, 'https://shop.test');
  const dl = await route(new Request(link), env);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('Content-Type'), 'application/pdf');
  assert.match(dl.headers.get('Content-Disposition'), /research-with-ai\.pdf/);
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()), PDF);
});

test('download links cannot be forged, reused for another book, or used after expiry', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { verify } = await paidOrder(env, rz);
  const url = new URL((await (await handleVerifyPayment(verify, env, rz.fetchImpl)).json()).downloads[0].downloadUrl);
  const tampered = new URL(url); tampered.searchParams.set('s', '0'.repeat(64));
  assert.equal((await route(new Request(tampered), env)).status, 403);
  const other = new URL(url.toString().replace('/eb-onsale1', '/eb-soon0002'));
  assert.equal((await route(new Request(other), env)).status, 403);
  const old = new URL(url); old.searchParams.set('e', '1000');
  assert.equal((await route(new Request(old), env)).status, 403);
  const noSig = new URL(`https://shop.test/api/download/eb-onsale1`);
  assert.equal((await route(new Request(noSig), env)).status, 403);
});

test('a payment from a different order cannot unlock this order', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const cheap = await (await handleCreateOrder(post({ items: cart, ...buyer }), env, rz.fetchImpl)).json();
  rz.payments.pay_cheap = { id: 'pay_cheap', order_id: cheap.orderId, status: 'captured', amount: cheap.amount };
  const sig = await hmacSha256Hex(KEYS.RAZORPAY_KEY_SECRET, `order_999|pay_cheap`);
  const v = await handleVerifyPayment(post({ razorpay_order_id: 'order_999', razorpay_payment_id: 'pay_cheap', razorpay_signature: sig, ...buyer }), env, rz.fetchImpl);
  assert.notEqual(v.status, 200);
});

test('an unpaid (failed) payment is rejected', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { verify } = await paidOrder(env, rz);
  rz.payments.pay_1.status = 'failed';
  assert.equal((await handleVerifyPayment(verify, env, rz.fetchImpl)).status, 400);
});

test('gateway error never falls back to the free sandbox', async () => {
  const r = await handleCreateOrder(post({ items: cart, ...buyer }), await shop({ ...KEYS, TAMYIZ_SANDBOX: 'true' }), async () => new Response('bad', { status: 401 }));
  assert.equal(r.status, 502);
});

test('sandbox (TAMYIZ_SANDBOX=true) works for on-sale books only', async () => {
  const env = await shop({ TAMYIZ_SANDBOX: 'true' });
  assert.equal((await (await handleCreateOrder(post({ items: cart, ...buyer }), env)).json()).mode, 'atelier_sandbox');
  const v = await (await handleVerifyPayment(post({ items: cart, ...buyer }), env)).json();
  assert.equal(v.verified, true);
  assert.equal((await route(new Request(v.downloads[0].downloadUrl), env)).status, 200);
  assert.equal((await handleVerifyPayment(post({ items: [{ productId: 'eb-soon0002' }], ...buyer }), env)).status, 409);
  // A sandbox link is worthless once the sandbox is off.
  assert.equal((await route(new Request(v.downloads[0].downloadUrl), await shop())).status, 403);
});

test('coming soon: cannot be ordered, even with real keys; no Razorpay order is made', async () => {
  const rz = fakeRazorpay();
  for (const env of [await shop(KEYS), await shop({ TAMYIZ_SANDBOX: 'true' })]) {
    const r = await handleCreateOrder(post({ items: [{ productId: 'eb-soon0002' }], ...buyer }), env, rz.fetchImpl);
    assert.equal(r.status, 409);
  }
  assert.equal(Object.keys(rz.orders).length, 0);
});

test('unknown or deleted books are refused', async () => {
  const r = await handleCreateOrder(post({ items: [{ productId: 'eb-gone0000' }], ...buyer }), await shop(KEYS), fakeRazorpay().fetchImpl);
  assert.equal(r.status, 400);
});

test('prices come from the catalogue, not the cart; one copy per book', async () => {
  const catalog = [{ id: 'eb-onsale1', name: 'x', price: 299, status: 'on-sale' }];
  const t = calculateOrderTotal([{ productId: 'eb-onsale1', price: 1 }, { productId: 'eb-onsale1' }], 'TESTCODE15', catalog);
  assert.equal(t.subtotal, 299);
  assert.equal(t.total, 254);
});

test('verification returns prices for the receipt screen', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { verify } = await paidOrder(env, rz, cart, 'TESTCODE15');
  const res = await (await handleVerifyPayment(verify, env, rz.fetchImpl)).json();
  assert.equal(res.amount, 25400);
  assert.equal(res.totalINR, 254);
  assert.equal(res.subtotalINR, 299);
  assert.equal(res.discountINR, 45);
  assert.equal(res.downloads[0].price, 299);
});

test('a paid order is still delivered if the book is switched off afterwards', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { verify } = await paidOrder(env, rz);
  const list = await env.TAMYIZ_STORE.get('products', 'json');
  list[0].status = 'soon';
  await env.TAMYIZ_STORE.put('products', JSON.stringify(list));
  assert.equal((await handleVerifyPayment(verify, env, rz.fetchImpl)).status, 200);
});

test('order notes round-trip and stay within Razorpay limits', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ productId: 'eb-' + String(i).padStart(8, '0'), variant: 'PDF' }));
  const notes = itemsToNotes(items);
  assert.ok(Object.values(notes).every((v) => v.length <= 256));
  assert.deepEqual(notesToItems(notes), items);
});

test('helpers', async () => {
  assert.ok(timingSafeEqual('abc', 'abc'));
  assert.ok(!timingSafeEqual('abc', 'abd'));
  assert.ok(!timingSafeEqual('abc', 'abcd'));
  assert.equal(await hmacSha256Hex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('the template\'s public promo codes no longer give a discount', () => {
  const catalog = [{ id: 'eb-onsale1', name: 'x', price: 299, status: 'on-sale' }];
  for (const code of ['TAMYIZ15', 'WELCOME10', 'DISTINCT10', 'DISTINCT', 'HORIZON500']) {
    assert.equal(calculateOrderTotal([{ productId: 'eb-onsale1' }], code, catalog).total, 299, code);
  }
});

// ---------------------------------------------------------------- receipt email
import { sendReceiptEmail, receiptEmail } from '../server/payments.js';
const ORDER = { email: 'buyer@example.com', phone: '+919999999999', referenceId: 'TAMYIZ-ORD-1', paymentId: 'pay_1', totalINR: 299,
  downloads: [{ name: 'The <b>AI</b> Playbook', price: 299, downloadUrl: 'https://shop.test/api/download/x?p=1&s=2' }] };

test('receipt email: nothing is sent without a provider key', async () => {
  let called = false;
  assert.equal(await sendReceiptEmail(ORDER, {}, async () => { called = true; return new Response('{}'); }), false);
  assert.equal(called, false);
});

test('receipt email: Brevo gets the buyer, the Gmail sender and escaped content', async () => {
  let sent;
  const ok = await sendReceiptEmail(ORDER, { BREVO_API_KEY: 'k' }, async (url, opts) => { sent = { url, opts }; return new Response('{"messageId":"1"}', { status: 201 }); });
  assert.equal(ok, true);
  assert.equal(sent.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(sent.opts.headers['api-key'], 'k');
  const body = JSON.parse(sent.opts.body);
  assert.deepEqual(body.to, [{ email: 'buyer@example.com' }]);
  assert.equal(body.sender.email, 'tamyiz.co@gmail.com');
  assert.ok(body.htmlContent.includes('The &lt;b&gt;AI&lt;/b&gt; Playbook'));
  assert.ok(body.htmlContent.includes('p=1&amp;s=2'));
  assert.ok(body.textContent.includes('https://shop.test/api/download/x?p=1&s=2'));
  assert.ok(!/tax invoice/i.test(body.htmlContent));
});

test('receipt email: a refused send reports false, so the page does not claim it was emailed', async () => {
  const ok = await sendReceiptEmail(ORDER, { BREVO_API_KEY: 'k' }, async () => new Response('{"message":"sender not verified"}', { status: 400 }));
  assert.equal(ok, false);
  assert.match(receiptEmail(ORDER).subject, /TAMYIZ-ORD-1/);
});

// ---------------------------------------------------------------- security fixes
test('download link allows up to MAX_DOWNLOADS (10) and then blocks abuse with 403', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const { verify } = await paidOrder(env, rz);
  const res = await (await handleVerifyPayment(verify, env, rz.fetchImpl)).json();
  const link = new URL(res.downloads[0].downloadUrl);

  for (let i = 1; i <= MAX_DOWNLOADS; i++) {
    const dl = await route(new Request(link), env);
    assert.equal(dl.status, 200, `download ${i} should succeed`);
  }
  const blocked = await route(new Request(link), env);
  assert.equal(blocked.status, 403);
  const data = await blocked.json();
  assert.match(data.error, /Download limit reached/);
});

test('order creation is rate limited per client IP to prevent flooding', async () => {
  const env = await shop(KEYS); const rz = fakeRazorpay();
  const ipHeaders = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.42' };
  const makeReq = () => new Request('https://shop.test/api/create-order', {
    method: 'POST',
    headers: ipHeaders,
    body: JSON.stringify({ items: cart, ...buyer })
  });

  for (let i = 1; i <= 20; i++) {
    const r = await handleCreateOrder(makeReq(), env, rz.fetchImpl);
    assert.equal(r.status, 200, `order creation ${i} should succeed`);
  }
  const throttled = await handleCreateOrder(makeReq(), env, rz.fetchImpl);
  assert.equal(throttled.status, 429);
  const data = await throttled.json();
  assert.match(data.error, /Too many checkout attempts/);
});

test('razorpay webhook: validates signature and fulfills order asynchronously', async () => {
  const webhookSecret = 'test_hook_secret_xyz';
  const env = await shop({ ...KEYS, RAZORPAY_WEBHOOK_SECRET: webhookSecret, BREVO_API_KEY: 'test_brevo' });
  const secret = webhookSecret;

  const payload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_hook_1',
          order_id: 'order_hook_1',
          amount: 29900,
          notes: { ...itemsToNotes(cart), email: 'buyer@webhook.test', phone: '+919876543210' },
          email: 'buyer@webhook.test',
          contact: '+919876543210'
        }
      }
    }
  };
  const bodyText = JSON.stringify(payload);
  const sig = await hmacSha256Hex(secret, bodyText);

  // Webhook secret required (no fallback to key secret)
  const envNoWebhookSecret = await shop({ ...KEYS, BREVO_API_KEY: 'test_brevo' });
  const noSecretRes = await route(new Request('https://shop.test/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'any' },
    body: bodyText
  }), envNoWebhookSecret);
  assert.equal(noSecretRes.status, 503);

  // Missing signature
  const missingSig = await route(new Request('https://shop.test/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyText
  }), env);
  assert.equal(missingSig.status, 400);

  // Forged signature
  const forgedSig = await route(new Request('https://shop.test/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'bad_sig' },
    body: bodyText
  }), env);
  assert.equal(forgedSig.status, 400);

  // Irrelevant event
  const otherEvent = JSON.stringify({ event: 'order.created' });
  const otherSig = await hmacSha256Hex(secret, otherEvent);
  const ignored = await route(new Request('https://shop.test/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': otherSig },
    body: otherEvent
  }), env);
  assert.equal(ignored.status, 200);
  assert.equal((await ignored.json()).status, 'ignored');

  // Valid fulfillment with Brevo stub and Razorpay order mock
  let emailSent = false;
  const webhookFetch = async (url) => {
    if (String(url).includes('api.brevo.com')) {
      emailSent = true;
      return new Response('{"messageId":"hook-123"}', { status: 201 });
    }
    if (String(url).includes('api.razorpay.com/v1/orders/order_hook_1')) {
      return new Response(JSON.stringify({
        id: 'order_hook_1',
        amount: 29900,
        notes: { ...itemsToNotes(cart), email: 'buyer@webhook.test', phone: '+919876543210' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const validReq = new Request('https://shop.test/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: bodyText
  });
  const res = await route(validReq, env, webhookFetch);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'fulfilled');
  assert.equal(data.paymentId, 'pay_hook_1');
  assert.equal(emailSent, true);

  // Verify KV record was created
  const stored = await env.TAMYIZ_STORE.get('order-fulfilled:pay_hook_1', 'json');
  assert.ok(stored);
  assert.equal(stored.orderId, 'order_hook_1');
  assert.equal(stored.email, 'buyer@webhook.test');

  // Deduplication check: second webhook execution should not resend email or re-fulfill
  emailSent = false;
  const dupReq = new Request('https://shop.test/api/webhook/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: bodyText
  });
  const dupRes = await route(dupReq, env, webhookFetch);
  assert.equal(dupRes.status, 200);
  assert.equal((await dupRes.json()).status, 'already_fulfilled');
  assert.equal(emailSent, false);
});
