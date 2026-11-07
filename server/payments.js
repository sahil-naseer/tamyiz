import { loadCatalog, findById } from './catalog.js';
import { markCartRecovered } from './abandoned.js';

/**
 * TAMYIZ™ payments: prices, coupons, Razorpay orders and verification, download links, receipt email.
 *
 * Runs on Cloudflare Pages Functions (functions/api/*) and in the local Vite dev server (vite.config.js).
 * Settings come in as `env` (Cloudflare: Project → Settings → Variables and secrets), never from the browser.
 *
 * Security rules (23 Oct 2026):
 * - The server decides the payment mode. The browser's "mode" field is ignored.
 * - With Razorpay keys set, a purchase unlocks only after the signature checks out AND Razorpay confirms
 *   the payment belongs to that order and is authorized/captured for the full amount.
 * - What gets unlocked comes from the Razorpay order (written there at creation), never from the browser.
 * - The sandbox simulator (no real payment) only runs when TAMYIZ_SANDBOX is "true". Never set it in production.
 * - Prices and what can be bought come from the catalogue in KV (server/catalog.js), managed on /admin.
 *   Only ebooks with status "on-sale" can be ordered.
 * - Downloads are signed links (/api/download/...), valid for a year, given only after verification.
 */

// Verified Coupon Codes
// Standard welcome discounts and special promotion codes
export const VALID_COUPONS = {
  SAMPLE10: { type: 'percent', value: 10, label: '10% sample reader gift' },
};

/**
 * Validates cart items and computes strict server-side price in INR & paise.
 * Synchronous by default for backwards compatibility with tests and callers.
 */
export function calculateOrderTotal(items, couponCode = null, catalog = [], dynamicCoupons = null) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart contains no valid items");
  }

  let subtotal = 0;
  const validatedItems = [];
  const seen = new Set();

  for (const item of items) {
    const prodId = String(item.productId || item.id || '');
    if (seen.has(prodId)) continue; // one copy of an ebook is enough
    seen.add(prodId);
    const catProd = findById(catalog, prodId);
    if (!catProd) {
      throw new Error('One of the items in your bag is no longer available. Please remove it and try again.');
    }
    const price = catProd.price;
    subtotal += price;
    validatedItems.push({ productId: prodId, name: catProd.name, variant: 'PDF', price, status: catProd.status });
  }

  // Automatic volume bundle discount: 2 books -> 20% off, 3+ books -> 25% off
  let bundleDiscount = 0;
  if (validatedItems.length >= 3) {
    bundleDiscount = Math.round(subtotal * 0.25);
  } else if (validatedItems.length === 2) {
    bundleDiscount = Math.round(subtotal * 0.20);
  }

  // Calculate discount if coupon provided
  let couponDiscount = 0;
  if (couponCode) {
    const cleanCode = String(couponCode).toUpperCase().trim();
    let c = VALID_COUPONS[cleanCode];

    if (!c && dynamicCoupons && dynamicCoupons[cleanCode] && dynamicCoupons[cleanCode].active !== false) {
      c = dynamicCoupons[cleanCode];
    }

    if (c) {
      if (c.type === 'percent') {
        // Apply percent discount on the remaining subtotal after bundle discount
        couponDiscount = Math.round((subtotal - bundleDiscount) * (c.value / 100));
      } else if (c.type === 'flat' && (!c.minOrder || subtotal >= c.minOrder)) {
        couponDiscount = c.value;
      }
    }
  }

  const discount = Math.min(subtotal - 1, bundleDiscount + couponDiscount);
  const total = Math.max(1, subtotal - discount);
  const amountPaise = total * 100;

  return {
    subtotal,
    bundleDiscount,
    couponDiscount,
    discount,
    total,
    amountPaise,
    items: validatedItems
  };
}

export async function getDynamicCoupons(env) {
  if (!env || !env.TAMYIZ_STORE || !env.TAMYIZ_STORE.get) return {};
  try {
    const raw = await env.TAMYIZ_STORE.get('store:coupons');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** A valid coupon's public details (hard-coded or made on /admin), or null. */
export async function findCoupon(env, code) {
  const clean = String(code || '').toUpperCase().trim().slice(0, 30);
  if (!clean) return null;
  let c = VALID_COUPONS[clean];
  if (!c) {
    const dyn = await getDynamicCoupons(env);
    if (dyn[clean] && dyn[clean].active !== false) c = dyn[clean];
  }
  if (!c) return null;
  return { code: clean, type: c.type === 'flat' ? 'flat' : 'percent', value: Number(c.value) || 0, label: String(c.label || ''), minOrder: Number(c.minOrder) || 0 };
}

/** Secret used to sign download links. Sandbox-only fallback so local testing works without keys. */
function downloadSecret(env) {
  if (env.DOWNLOAD_SECRET) return String(env.DOWNLOAD_SECRET);
  if (env.RAZORPAY_KEY_SECRET) return String(env.RAZORPAY_KEY_SECRET);
  if (sandboxEnabled(env)) return 'tamyiz-sandbox-only';
  return null;
}

const DOWNLOAD_DAYS = 365;

/** A private download link for one paid ebook: /api/download/<id>?p=<payment>&e=<expiry>&s=<signature>. */
export async function signDownload(env, productId, paymentId, now = Date.now()) {
  const secret = downloadSecret(env);
  if (!secret) throw new Error('Downloads are not set up (no signing secret).');
  const exp = Math.floor(now / 1000) + DOWNLOAD_DAYS * 86400;
  const sig = await hmacSha256Hex(secret, `dl|${productId}|${paymentId}|${exp}`);
  return `/api/download/${encodeURIComponent(productId)}?p=${encodeURIComponent(paymentId)}&e=${exp}&s=${sig}`;
}

export async function checkDownload(env, productId, paymentId, exp, sig) {
  const secret = downloadSecret(env);
  if (!secret || !paymentId || !exp || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacSha256Hex(secret, `dl|${productId}|${paymentId}|${exp}`);
  return timingSafeEqual(expected, sig);
}

export const MAX_DOWNLOADS = 10;

/** GET /api/download/<id>: streams the PDF to someone holding a valid signed link. */
export async function handleDownload(request, env, productId) {
  const u = new URL(request.url);
  const paymentId = u.searchParams.get('p');
  const ok = await checkDownload(env, productId, paymentId, u.searchParams.get('e'), u.searchParams.get('s'));
  if (!ok) return json({ error: 'This download link is not valid or has expired. Message us on WhatsApp with your order reference.' }, 403);
  if (!env.TAMYIZ_STORE) return json({ error: 'Storage is not connected.' }, 503);

  // Anti-piracy guard: limit total successful downloads per purchased book
  if (paymentId && env.TAMYIZ_STORE.get) {
    const dlKey = `dl-count:${paymentId}:${productId}`;
    const count = Number(await env.TAMYIZ_STORE.get(dlKey)) || 0;
    if (count >= MAX_DOWNLOADS) {
      return json({
        error: `Download limit reached (${MAX_DOWNLOADS}/${MAX_DOWNLOADS}). If you need an additional copy, message us on WhatsApp with your payment ID: ${paymentId}.`
      }, 403);
    }
    await env.TAMYIZ_STORE.put(dlKey, String(count + 1), { expirationTtl: DOWNLOAD_DAYS * 86400 });
  }

  const product = findById(await loadCatalog(env), productId);
  const { value, metadata } = await env.TAMYIZ_STORE.getWithMetadata(`file:${productId}`, 'stream');
  if (!value) return json({ error: 'The file is missing. Message us on WhatsApp and we will send it.' }, 404);
  const filename = `${(product && product.slug) || productId}.pdf`;
  return new Response(value, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(metadata && metadata.size ? { 'Content-Length': String(metadata.size) } : {}),
    },
  });
}

/**
 * The receipt email: what was bought, the download buttons, and how to get help.
 * Sent with Brevo (BREVO_API_KEY; sender = RECEIPT_FROM, a sender address verified in Brevo, default tamyiz.co@gmail.com)
 * or Resend (RESEND_API_KEY; needs a domain you own). Returns true only if the provider accepted it.
 * Never blocks the purchase: the download is always shown on screen too.
 */
export function receiptEmail({ email, phone, referenceId, paymentId, totalINR, downloads, date }) {
  const e = escapeHtml;
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const when = new Date(date || Date.now()).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  const rows = downloads.map((dl) => `
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #ECECE8;">
              <div style="font-size:16px;font-weight:700;color:#0B0B0B;">${e(dl.name)}</div>
              <div style="font-size:13px;color:#5E5E59;margin-top:2px;">PDF e-book${dl.price ? ' · ' + inr(dl.price) : ''}</div>
            </td>
            <td style="padding:14px 0;border-bottom:1px solid #ECECE8;text-align:right;white-space:nowrap;">
              <a href="${e(dl.downloadUrl)}" style="display:inline-block;background:#0B0B0B;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:999px;">Download PDF</a>
            </td>
          </tr>`).join('');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:24px 12px;background:#F2F2EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B0B0B;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E4E4E0;">
    <div style="background:#0B0B0B;color:#FFFFFF;padding:22px 28px;font-size:18px;font-weight:800;letter-spacing:4px;">TAMYIZ</div>
    <div style="padding:28px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#1E7B2E;text-transform:uppercase;">● Payment received</div>
      <h1 style="font-size:24px;line-height:1.25;margin:8px 0 10px;">Thank you. Your e-book is ready.</h1>
      <p style="font-size:15px;line-height:1.6;color:#3A3A36;margin:0 0 20px;">Tap the button to download your PDF. Save it to your phone or laptop; the link works for one year.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}
      </table>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px;color:#3A3A36;">
        <tr><td style="padding:3px 0;">Total paid</td><td style="padding:3px 0;text-align:right;font-weight:700;color:#0B0B0B;">${inr(totalINR)}</td></tr>
        <tr><td style="padding:3px 0;">Order</td><td style="padding:3px 0;text-align:right;">${e(referenceId)}</td></tr>
        <tr><td style="padding:3px 0;">Payment ID</td><td style="padding:3px 0;text-align:right;">${e(paymentId)}</td></tr>
        <tr><td style="padding:3px 0;">Date</td><td style="padding:3px 0;text-align:right;">${e(when)}</td></tr>
        <tr><td style="padding:3px 0;">Email</td><td style="padding:3px 0;text-align:right;">${e(email)}</td></tr>
        ${phone ? `<tr><td style="padding:3px 0;">Phone</td><td style="padding:3px 0;text-align:right;">${e(phone)}</td></tr>` : ''}
      </table>
      <p style="font-size:14px;line-height:1.6;color:#3A3A36;margin:22px 0 0;padding:14px 16px;background:#F7F7F5;border-radius:12px;">Lost the file or need help? WhatsApp us on <b>+91 95417 22379</b> or reply to this email with your order number, and we'll send it again.</p>
    </div>
    <div style="padding:18px 28px;border-top:1px solid #ECECE8;font-size:12px;line-height:1.6;color:#7A7A75;">
      This is your receipt from TAMYIZ (tamyiz.pages.dev), run by Sahil Naseer and Basit Majeed, Sopore, Jammu &amp; Kashmir 193201, India.<br/>
      Questions: tamyiz.co@gmail.com · Personal licence: please don't share the file.
    </div>
  </div>
</body></html>`;
  const text = [
    'TAMYIZ - Payment received. Your e-book is ready.', '',
    ...downloads.map((dl) => `${dl.name}: ${dl.downloadUrl}`), '',
    `Total paid: ${inr(totalINR)}`, `Order: ${referenceId}`, `Payment ID: ${paymentId}`, `Date: ${when}`, '',
    'The download links work for one year. Lost the file? WhatsApp +91 95417 22379 with your order number.',
  ].join('\n');
  return { subject: `Your TAMYIZ e-book is ready · ${referenceId}`, html, text };
}

export async function sendReceiptEmail(order, env = {}, fetchImpl = fetch) {
  const to = String(order.email || '').trim();
  if (!to.includes('@') || (!env.BREVO_API_KEY && !env.RESEND_API_KEY)) return false;
  const { subject, html, text } = receiptEmail(order);
  const fromEmail = String(env.RECEIPT_FROM || 'tamyiz.co@gmail.com').replace(/^.*<|>.*$/g, '').trim();
  try {
    const res = env.BREVO_API_KEY
      ? await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { name: 'TAMYIZ', email: fromEmail }, to: [{ email: to }], replyTo: { email: 'tamyiz.co@gmail.com', name: 'TAMYIZ' }, subject, htmlContent: html, textContent: text }),
      })
      : await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.RECEIPT_FROM || 'TAMYIZ <onboarding@resend.dev>', to: [to], reply_to: 'tamyiz.co@gmail.com', subject, html, text }),
      });
    if (!res.ok) console.error('Receipt email refused:', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error('Receipt email error:', err);
    return false;
  }
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Same-site only: the site's own pages call these. No wildcard origin.
  'Cache-Control': 'no-store'
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const NOT_RELEASED = 'This edition is not out yet. Message us on WhatsApp (+91 95417 22379) to pre-order and we will tell you the day it is ready.';

/** Ids of ordered items that are not on sale. */
export function notOnSale(items) {
  return [...new Set(items.filter((i) => i.status !== 'on-sale').map((i) => i.productId))];
}

export function hasRazorpayKeys(env) {
  return Boolean(
    env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET &&
    !String(env.RAZORPAY_KEY_ID).includes('YOUR_') && !String(env.RAZORPAY_KEY_SECRET).includes('YOUR_')
  );
}

export const sandboxEnabled = (env) => String(env.TAMYIZ_SANDBOX || '').toLowerCase() === 'true';

const PAYMENTS_OFF =
  "Online payments aren't switched on yet. Message us on WhatsApp (+91 95417 22379) and we'll sort your order.";

/** HMAC-SHA256 as hex, with Web Crypto (works on Cloudflare and Node 18+). */
export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings in constant time (no early exit), so the signature can't be guessed byte by byte. */
export function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const basicAuth = (env) => 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

/**
 * The cart, written into the Razorpay order's notes so verification can read it back from Razorpay.
 * Format: "productId~variant|productId~variant", split over note keys i0, i1 ... (Razorpay: 256 chars per note).
 */
export function itemsToNotes(items) {
  const flat = items.map((i) => `${i.productId}~${i.variant}`).join('|');
  const notes = {};
  for (let k = 0, i = 0; i < flat.length; i += 250, k++) notes[`i${k}`] = flat.slice(i, i + 250);
  if (Object.keys(notes).length > 12) throw new Error('Too many items in one order. Please split your order.');
  return notes;
}

export function notesToItems(notes = {}) {
  const flat = Object.keys(notes)
    .filter((k) => /^i\d+$/.test(k))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((k) => notes[k])
    .join('');
  if (!flat) return [];
  return flat.split('|').map((p) => {
    const [productId, variant] = p.split('~');
    return { productId, variant };
  });
}

function cleanContact(email, phone) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(phone || '').replace(/[^0-9+]/g, '');
  if (!e || !e.includes('@') || !e.includes('.') || e.length > 254) return { error: 'A valid email address is required for digital dispatch.' };
  if (!p || p.length < 10 || p.length > 16) return { error: 'A valid WhatsApp phone number (minimum 10 digits) is required.' };
  return { email: e, phone: p };
}

export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';
const ORDER_RATE_LIMIT = 20; // max 20 order creations per 10 mins per IP
const ORDER_RATE_TTL = 10 * 60;

// ---------------------------------------------------------------------------
// POST /api/create-order
// ---------------------------------------------------------------------------

export async function handleCreateOrder(request, env, fetchImpl = fetch) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { items, email, phone, coupon, couponCode } = body || {};

  if (!Array.isArray(items) || items.length === 0) return json({ error: 'Atelier bag contains no valid items.' }, 400);
  const contact = cleanContact(email, phone);
  if (contact.error) return json({ error: contact.error }, 400);

  // Rate limiting per IP to prevent Razorpay order flooding
  const ip = clientIp(request);
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get && ip !== 'local') {
    const rateKey = `order-rate:${ip}`;
    const recent = Number(await env.TAMYIZ_STORE.get(rateKey)) || 0;
    if (recent >= ORDER_RATE_LIMIT) {
      return json({ error: 'Too many checkout attempts. Please wait a few minutes before trying again or message us on WhatsApp.' }, 429);
    }
    await env.TAMYIZ_STORE.put(rateKey, String(recent + 1), { expirationTtl: ORDER_RATE_TTL });
  }

  const catalog = await loadCatalog(env);
  let order;
  const dynamicCoupons = await getDynamicCoupons(env);
  try { order = calculateOrderTotal(items, coupon || couponCode, catalog, dynamicCoupons); }
  catch (err) { return json({ error: err.message }, 400); }

  const notYet = notOnSale(order.items);
  if (notYet.length) return json({ error: NOT_RELEASED, productIds: notYet }, 409);

  if (hasRazorpayKeys(env)) {
    let notes;
    try { notes = { ...itemsToNotes(order.items), email: contact.email, phone: contact.phone }; }
    catch (err) { return json({ error: err.message }, 400); }

    const rzpRes = await fetchImpl('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: basicAuth(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: order.amountPaise, currency: 'INR', receipt: `rcpt_${Date.now()}`, notes })
    });
    if (!rzpRes.ok) {
      console.error('Razorpay order error:', rzpRes.status, await rzpRes.text().catch(() => ''));
      // Never fall back to the free sandbox when real keys are set.
      return json({ error: 'The payment gateway is not responding. Please try again in a minute.' }, 502);
    }
    const rzp = await rzpRes.json();
    return json({
      mode: 'razorpay',
      orderId: rzp.id,
      amount: rzp.amount,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID,
      totalINR: order.total,
      subtotalINR: order.subtotal,
      discountINR: order.discount,
      email: contact.email,
      phone: contact.phone
    });
  }

  if (sandboxEnabled(env)) {
    return json({
      mode: 'atelier_sandbox',
      orderId: `order_sandbox_${Date.now()}`,
      amount: order.amountPaise,
      currency: 'INR',
      totalINR: order.total,
      subtotalINR: order.subtotal,
      discountINR: order.discount,
      email: contact.email,
      phone: contact.phone,
      isSandbox: true
    });
  }

  return json({ error: PAYMENTS_OFF }, 503);
}

// ---------------------------------------------------------------------------
// POST /api/verify-payment
// ---------------------------------------------------------------------------

/**
 * A payment already fulfilled (page refreshed, or the webhook ran first): answer with the saved order instead of
 * fulfilling twice. Security (7 Nov 2026): only called AFTER the Razorpay signature has been checked, so a
 * payment ID alone (it is visible in every download link) can never return the buyer's details or new links.
 */
async function alreadyFulfilled(request, env, paymentId) {
  if (!paymentId || !env || !env.TAMYIZ_STORE || !env.TAMYIZ_STORE.get) return null;
  try {
    const existingRaw = await env.TAMYIZ_STORE.get(`order-fulfilled:${paymentId}`);
    if (!existingRaw) return null;
    const existing = JSON.parse(existingRaw);
    const origin = new URL(request.url).origin;
    const downloads = await Promise.all((existing.items || []).map(async (i) => ({
      productId: i.productId || i.id,
      name: i.name,
      variant: 'PDF',
      formatType: 'ebook',
      downloadUrl: origin + (await signDownload(env, i.productId || i.id, existing.paymentId)),
      actionLabel: 'Download PDF ↗',
      specs: 'PDF e-book • DRM-free',
      price: i.price,
    })));
    return json({
      verified: true,
      mode: existing.mode,
      referenceId: existing.referenceId,
      paymentId: existing.paymentId,
      orderId: existing.orderId,
      timestamp: existing.createdAt,
      email: existing.email,
      phone: existing.phone,
      itemsCount: (existing.items || []).length,
      amount: existing.amountPaise,
      totalINR: existing.totalINR,
      subtotalINR: existing.subtotalINR,
      discountINR: existing.discountINR,
      downloads,
      receiptEmailed: existing.receiptEmailed,
      alreadyFulfilled: true,
    });
  } catch {
    return null;
  }
}

export async function handleVerifyPayment(request, env, fetchImpl = fetch) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email, phone } = body || {};

  let paidItems;
  let paidOrderAmount;
  let mode;

  if (hasRazorpayKeys(env)) {
    mode = 'razorpay';
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Incomplete payment details. If you were charged, message us on WhatsApp.' }, 400);
    }
    // 1. Signature: proves Razorpay issued this payment for this order.
    const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqual(expected, razorpay_signature)) {
      return json({ error: 'Invalid payment signature. Verification failed.' }, 400);
    }
    const done = await alreadyFulfilled(request, env, razorpay_payment_id);
    if (done) return done;
    // 2. Ask Razorpay: the payment is for this order, authorized or captured, for the order's full amount.
    const [payRes, ordRes] = await Promise.all([
      fetchImpl(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, { headers: { Authorization: basicAuth(env) } }),
      fetchImpl(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`, { headers: { Authorization: basicAuth(env) } })
    ]);
    if (!payRes.ok || !ordRes.ok) {
      return json({ error: 'Could not confirm the payment with Razorpay. If you were charged, message us on WhatsApp.' }, 502);
    }
    const payment = await payRes.json();
    const rzpOrder = await ordRes.json();
    const okStatus = payment.status === 'captured' || payment.status === 'authorized';
    if (payment.order_id !== razorpay_order_id || !okStatus || Number(payment.amount) !== Number(rzpOrder.amount)) {
      return json({ error: 'Payment not completed for this order.' }, 400);
    }
    // 3. What was paid for comes from the order Razorpay stored, not from the browser.
    paidItems = notesToItems(rzpOrder.notes);
    paidOrderAmount = rzpOrder.amount;
    if (paidItems.length === 0) return json({ error: 'Order has no items. Message us on WhatsApp.' }, 400);
  } else if (sandboxEnabled(env)) {
    mode = 'atelier_sandbox';
    paidItems = Array.isArray(body.items) ? body.items.map((i) => ({ productId: i.productId || i.id, variant: i.variant || i.size })) : [];
    if (paidItems.length === 0) return json({ error: 'Missing items for digital fulfillment' }, 400);
  } else {
    return json({ error: PAYMENTS_OFF }, 503);
  }

  const contact = cleanContact(email, phone);
  const cleanEmail = contact.email || String(email || '').trim().toLowerCase();
  const cleanPhone = contact.phone || String(phone || '').trim();

  const refBytes = crypto.getRandomValues(new Uint8Array(5));
  const referenceId = 'TAMYIZ-ORD-' + Date.now().toString(36).toUpperCase() + [...refBytes].map((b) => b.toString(36)).join('').toUpperCase().slice(0, 6);
  const paymentId = razorpay_payment_id || `pay_sandbox_${Date.now()}`;
  const orderId = razorpay_order_id || `order_sandbox_${Date.now()}`;
  // Prices for the receipt screen, from the catalogue. Total = what Razorpay charged (or the sandbox total).
  const catalog = await loadCatalog(env);
  let priced;
  const dynamicCoupons = await getDynamicCoupons(env);
  try { priced = calculateOrderTotal(paidItems, null, catalog, dynamicCoupons); }
  catch { return json({ error: 'Your payment went through, but an item could not be found. Message us on WhatsApp with this payment ID: ' + paymentId }, 409); }
  // Sandbox (no real money) may only unlock ebooks that are on sale. A real, verified Razorpay payment is
  // always delivered, even if the ebook was switched off after the order was placed.
  if (mode === 'atelier_sandbox' && notOnSale(priced.items).length) return json({ error: NOT_RELEASED }, 409);
  const amountPaise = mode === 'razorpay' ? Number(paidOrderAmount) : priced.amountPaise;
  const totalINR = Math.round(amountPaise / 100);
  const origin = new URL(request.url).origin;
  const downloads = await Promise.all(priced.items.map(async (i) => ({
    productId: i.productId,
    name: i.name,
    variant: 'PDF',
    formatType: 'ebook',
    downloadUrl: origin + (await signDownload(env, i.productId, paymentId)),
    actionLabel: 'Download PDF ↗',
    specs: 'PDF e-book • DRM-free',
    price: i.price,
  })));

  const receiptEmailed = await sendReceiptEmail({ email: cleanEmail, phone: cleanPhone, referenceId, paymentId, totalINR, downloads }, env, fetchImpl)
    .catch(() => false);

  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.put) {
    const orderData = {
      orderId,
      referenceId,
      paymentId,
      mode,
      amountPaise,
      totalINR,
      subtotalINR: priced.subtotal,
      discountINR: Math.max(0, priced.subtotal - totalINR),
      email: cleanEmail,
      phone: cleanPhone,
      items: priced.items,
      receiptEmailed: Boolean(receiptEmailed),
      status: 'paid',
      createdAt: new Date().toISOString()
    };
    await env.TAMYIZ_STORE.put(`order-fulfilled:${paymentId}`, JSON.stringify(orderData), { expirationTtl: 365 * 86400 }).catch(() => {});
    await env.TAMYIZ_STORE.put(`order:${orderId}`, JSON.stringify(orderData)).catch(() => {});

    // Maintain a persistent list of recent order IDs for the admin dashboard
    try {
      const orderIndexRaw = await env.TAMYIZ_STORE.get('orders:index');
      let orderIndex = [];
      try { orderIndex = orderIndexRaw ? JSON.parse(orderIndexRaw) : []; } catch { orderIndex = []; }
      if (!orderIndex.includes(orderId)) {
        orderIndex.unshift(orderId);
        if (orderIndex.length > 500) orderIndex = orderIndex.slice(0, 500);
        await env.TAMYIZ_STORE.put('orders:index', JSON.stringify(orderIndex));
      }
      await markCartRecovered(env, cleanEmail).catch(() => {});
    } catch (e) {
      console.error('Failed to update orders:index', e);
    }
  }

  return json({
    verified: true,
    mode,
    referenceId,
    paymentId,
    orderId,
    timestamp: new Date().toISOString(),
    email: cleanEmail,
    phone: cleanPhone,
    itemsCount: paidItems.length,
    amount: amountPaise,
    totalINR,
    subtotalINR: priced.subtotal,
    discountINR: Math.max(0, priced.subtotal - totalINR),
    downloads,
    receiptEmailed
  });
}

// ---------------------------------------------------------------------------
// POST /api/webhook/razorpay
// Background payment capture fulfillment (handles closed-tab payments)
// ---------------------------------------------------------------------------

export async function handleRazorpayWebhook(request, env, fetchImpl = fetch) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET;
  if (!secret) return json({ error: 'Webhook secret not configured on server.' }, 503);

  const sig = request.headers.get('x-razorpay-signature');
  if (!sig) return json({ error: 'Missing x-razorpay-signature header.' }, 400);

  let rawBody = '';
  try { rawBody = await request.text(); } catch { rawBody = ''; }

  const expectedSig = await hmacSha256Hex(secret, rawBody);
  if (!timingSafeEqual(expectedSig, sig)) {
    return json({ error: 'Invalid webhook signature.' }, 400);
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON payload.' }, 400); }

  const eventName = event.event;
  if (eventName !== 'payment.captured' && eventName !== 'order.paid') {
    return json({ status: 'ignored', event: eventName }, 200);
  }

  const pEntity = event.payload?.payment?.entity || {};
  const oEntity = event.payload?.order?.entity || {};
  const paymentId = pEntity.id;
  const orderId = pEntity.order_id || oEntity.id;

  if (!paymentId) return json({ error: 'Missing payment entity in webhook.' }, 400);

  // Deduplication: if the user already stayed on-page and verify-payment ran, skip email duplication
  const fulfilledKey = `order-fulfilled:${paymentId}`;
  if (env.TAMYIZ_STORE && env.TAMYIZ_STORE.get) {
    const existing = await env.TAMYIZ_STORE.get(fulfilledKey);
    if (existing) {
      return json({ status: 'already_fulfilled', paymentId }, 200);
    }
  }

  // Extract ordered items from Razorpay notes
  const notes = { ...(oEntity.notes || {}), ...(pEntity.notes || {}) };
  let items = notesToItems(notes);

  if (items.length === 0 && orderId && hasRazorpayKeys(env)) {
    try {
      const ordRes = await fetchImpl(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: basicAuth(env) }
      });
      if (ordRes.ok) {
        const rzpOrd = await ordRes.json();
        items = notesToItems(rzpOrd.notes || {});
      }
    } catch (err) {
      console.error('Failed to query order notes from Razorpay:', err);
    }
  }

  if (items.length === 0) return json({ error: 'No items found in order notes.' }, 400);

  const catalog = await loadCatalog(env);
  let priced;
  const dynamicCoupons = await getDynamicCoupons(env);
  try { priced = calculateOrderTotal(items, null, catalog, dynamicCoupons); }
  catch (err) { return json({ error: err.message }, 409); }

  const rawEmail = notes.email || pEntity.email || '';
  const rawPhone = notes.phone || pEntity.contact || '';
  const contact = cleanContact(rawEmail, rawPhone);
  const cleanEmail = contact.email || String(rawEmail || '').trim().toLowerCase();
  const cleanPhone = contact.phone || String(rawPhone || '').trim();

  const totalINR = Math.round(Number(pEntity.amount || priced.amountPaise) / 100);
  const referenceId = 'TAMYIZ-ORD-' + Date.now().toString(36).toUpperCase();
  const origin = new URL(request.url).origin;

  const downloads = await Promise.all(priced.items.map(async (i) => ({
    productId: i.productId,
    name: i.name,
    variant: 'PDF',
    formatType: 'ebook',
    downloadUrl: origin + (await signDownload(env, i.productId, paymentId)),
    actionLabel: 'Download PDF ↗',
    specs: 'PDF e-book • DRM-free',
    price: i.price,
  })));

  // Send Brevo email receipt with signed links directly to buyer
  const receiptEmailed = await sendReceiptEmail({
    email: cleanEmail,
    phone: cleanPhone,
    referenceId,
    paymentId,
    totalINR,
    downloads
  }, env, fetchImpl).catch(() => false);

  if (env.TAMYIZ_STORE && env.TAMYIZ_STORE.put) {
    const orderData = {
      orderId,
      referenceId,
      paymentId,
      mode: 'razorpay_webhook',
      amountPaise: Number(pEntity.amount || priced.amountPaise),
      totalINR,
      subtotalINR: priced.subtotal,
      discountINR: Math.max(0, priced.subtotal - totalINR),
      email: cleanEmail,
      phone: cleanPhone,
      items: priced.items,
      receiptEmailed: Boolean(receiptEmailed),
      status: 'paid',
      createdAt: new Date().toISOString()
    };
    await env.TAMYIZ_STORE.put(fulfilledKey, JSON.stringify(orderData), { expirationTtl: 365 * 86400 }).catch(() => {});
    await env.TAMYIZ_STORE.put(`order:${orderId}`, JSON.stringify(orderData)).catch(() => {});

    try {
      const orderIndexRaw = await env.TAMYIZ_STORE.get('orders:index');
      let orderIndex = [];
      try { orderIndex = orderIndexRaw ? JSON.parse(orderIndexRaw) : []; } catch { orderIndex = []; }
      if (!orderIndex.includes(orderId)) {
        orderIndex.unshift(orderId);
        if (orderIndex.length > 500) orderIndex = orderIndex.slice(0, 500);
        await env.TAMYIZ_STORE.put('orders:index', JSON.stringify(orderIndex));
      }
      await markCartRecovered(env, cleanEmail).catch(() => {});
    } catch (e) {
      console.error('Failed to update orders:index in webhook', e);
    }
  }

  return json({ status: 'fulfilled', paymentId, receiptEmailed: Boolean(receiptEmailed) }, 200);
}
