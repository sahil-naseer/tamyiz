/**
 * /api/admin/*: the private side of /admin.
 *
 * Login: the password is the Cloudflare secret TAMYIZ_ADMIN_PASSWORD (or ADMIN_PASSWORD; 12+ characters). A correct password gets a
 * signed cookie (HttpOnly, Secure, SameSite=Strict, 12 hours). The cookie is signed with a key made from ADMIN_SESSION_SECRET (or another server secret) plus the password, never the password alone. Changing ADMIN_PASSWORD logs everyone out.
 * Ten wrong passwords from one address lock logins from it for 15 minutes.
 * Every change also needs the header X-Tamyiz-Admin: 1 (pages on other sites can't send it).
 */
import { json, hmacSha256Hex, timingSafeEqual, signDownload, sendReceiptEmail, requestOrigin, STRICT_EMAIL_RE } from './payments.js';
import {
  loadCatalog, saveCatalog, store, findById, readFields, sniff, newId, uniqueSlug,
  MAX_PDF_BYTES, MAX_COVER_BYTES, StoreMissing,
} from './catalog.js';
import { getStats } from './stats.js';
import { getAdminReviews, approveReview, deleteReview } from './reviews.js';
import { getAdminAbandonedCarts, sendAbandonedCartRecoveryEmail, deleteAbandonedCart } from './abandoned.js';
import { handleAdminGetFilms, handleAdminSaveFilm, handleAdminDeleteFilm, handleAdminReorderFilms } from './films.js';

const COOKIE = 'tmz_admin';
const SESSION_SECONDS = 12 * 60 * 60;
const MIN_PASSWORD = 12;
const MAX_FAILS = 10;
const MAX_THUMB_BYTES = 400 * 1024;

// TAMYIZ_ADMIN_PASSWORD is accepted too: Cloudflare's dashboard once kept a ghost "ADMIN_PASSWORD" it wouldn't show.
const adminPassword = (env) => String(env.TAMYIZ_ADMIN_PASSWORD || env.ADMIN_PASSWORD || '');
const passwordReady = (env) => adminPassword(env).length >= MIN_PASSWORD;

/**
 * The key that signs the session cookie and the 2FA challenge. It must NOT be the password alone: anyone who knows
 * the password could then forge a cookie or work out the emailed code offline, which makes 2FA pointless
 * (found in the 14 Nov 2026 audit). It is derived from a server-only secret plus the password, so changing the
 * password still logs everyone out. Set ADMIN_SESSION_SECRET (any long random text) in Cloudflare; until then the
 * first of the other server secrets is used. Only with no secret at all (local development) does it fall back to the password.
 */
export const sessionSecretName = (env) =>
  ['ADMIN_SESSION_SECRET', 'DOWNLOAD_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_KEY_SECRET', 'BREVO_API_KEY'].find((k) => env[k]) || null;
async function signingKey(env) {
  const name = sessionSecretName(env);
  if (!name) return adminPassword(env);
  return hmacSha256Hex(String(env[name]), `tmz-admin-signing-key-v1|${adminPassword(env)}`);
}

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  for (const part of all.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export async function isAdmin(request, env) {
  if (!passwordReady(env)) return false;
  const raw = readCookie(request, COOKIE);
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacSha256Hex(await signingKey(env), `admin|${exp}`);
  if (!timingSafeEqual(expected, sig)) return false;

  // Server-side session revocation: tokens issued before the last logout are revoked
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get) {
    try {
      const revokedBefore = Number(await env.TAMYIZ_STORE.get('admin:revoked_before')) || 0;
      const issuedAt = Number(exp) - SESSION_SECONDS;
      if (issuedAt < revokedBefore) return false;
    } catch {}
  }

  return true;
}

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';

// Zero-KV-write in-memory rate/replay tracking per environment/store instance
// (prevents password brute-forcing, OTP replay, and email quota bombing without spending KV writes)
const securityBuckets = new WeakMap();
const fallbackState = createSecurityState();
function createSecurityState() {
  return { fails: new Map(), otpSends: new Map(), usedOtp: new Map(), otpFails: new Map() };
}
function getSecurityState(env) {
  if (env && typeof env.TAMYIZ_STORE === 'object' && env.TAMYIZ_STORE !== null) {
    if (!securityBuckets.has(env.TAMYIZ_STORE)) securityBuckets.set(env.TAMYIZ_STORE, createSecurityState());
    return securityBuckets.get(env.TAMYIZ_STORE);
  }
  return fallbackState;
}
function getCounter(map, key) {
  const rec = map.get(key);
  if (!rec) return 0;
  if (Date.now() > rec.expiresAt) { map.delete(key); return 0; }
  return rec.count;
}
function bumpCounter(map, key, ttlMs) {
  const prev = getCounter(map, key);
  map.set(key, { count: prev + 1, expiresAt: Date.now() + ttlMs });
  return prev + 1;
}
const getLoginFails = (env, ip) => getCounter(getSecurityState(env).fails, ip);
const recordLoginFail = (env, ip) => bumpCounter(getSecurityState(env).fails, ip, 15 * 60 * 1000);
const clearLoginFails = (env, ip) => getSecurityState(env).fails.delete(ip);
function pruneUsedOtp(usedOtp, nowSec) {
  if (usedOtp.size < 64) return;
  for (const [k, exp] of usedOtp.entries()) {
    if (exp < nowSec) usedOtp.delete(k);
  }
}

async function sendAdminOtpEmail(env, toEmails, otpCode, ip, fetchImpl = fetch) {
  if (!env.BREVO_API_KEY) return false;
  const senderEmail = env.RECEIPT_FROM || 'tamyiz.co@gmail.com';
  const to = toEmails.map((email) => ({ email }));
  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 460px; margin: 0 auto; padding: 28px; border: 1px solid #E5E5E0; border-radius: 16px; color: #0B0B0B;">
      <p style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #5E5E59; margin: 0 0 8px;">TAMYIZ™ ADMIN SECURITY</p>
      <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 12px;">Your 6-Digit Login Code</h2>
      <p style="font-size: 14px; color: #444; line-height: 1.5; margin: 0 0 20px;">Enter this one-time verification code to finish signing in to the TAMYIZ™ Admin Console:</p>
      <div style="background: #F4F4F0; border: 1.5px solid #0B0B0B; border-radius: 12px; padding: 16px; text-align: center; font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0B0B0B; margin-bottom: 20px;">
        ${otpCode}
      </div>
      <p style="font-size: 12px; color: #71716D; margin: 0;">Valid for 10 minutes • Requested from IP: ${String(ip).replace(/[^0-9a-fA-F.:a-z_-]/g, '')}</p>
    </div>
  `;
  const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'TAMYIZ Security', email: senderEmail },
      to,
      subject: `${otpCode} is your TAMYIZ Admin verification code`,
      htmlContent,
    }),
  });
  return res.ok;
}

async function login(request, env, fetchImpl = fetch) {
  if (!passwordReady(env)) {
    return json({ error: `Admin password not set. In Cloudflare add the secret TAMYIZ_ADMIN_PASSWORD (at least ${MIN_PASSWORD} characters).` }, 503);
  }
  const ip = clientIp(request);
  const fails = getLoginFails(env, ip);
  if (fails >= MAX_FAILS) return json({ error: 'Too many wrong passwords. Try again in 15 minutes.' }, 429);

  let body = {};
  try { body = await request.json(); } catch {}
  // Compare hashes, so the comparison takes the same time whatever the password length.
  const ok = timingSafeEqual(await sha256Hex(body.password || ''), await sha256Hex(adminPassword(env)));
  if (!ok) {
    recordLoginFail(env, ip);
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'Wrong password.' }, 401);
  }

  // Optional 2-Step Email OTP (2FA) when ADMIN_OTP_EMAIL + BREVO_API_KEY are configured (uses 0 KV writes via HMAC challenge)
  const otpEmails = String(env.ADMIN_OTP_EMAIL || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));

  if (otpEmails.length > 0 && env.BREVO_API_KEY) {
    const state = getSecurityState(env);
    const nowSec = Math.floor(Date.now() / 1000);
    pruneUsedOtp(state.usedOtp, nowSec);
    const submittedOtp = String(body.otp || '').trim();
    const challenge = String(body.challenge || '').trim();
    if (!submittedOtp || !challenge) {
      if (getCounter(state.otpSends, ip) >= 4) {
        return json({ error: 'Too many verification codes requested. Wait a few minutes before trying again.' }, 429);
      }
      bumpCounter(state.otpSends, ip, 10 * 60 * 1000);
      const rand = new Uint32Array(1);
      crypto.getRandomValues(rand);
      const otpCode = String(100000 + (rand[0] % 900000));
      const otpExp = nowSec + 600; // 10 minutes
      const otpSig = await hmacSha256Hex(await signingKey(env), `admin-otp|${otpExp}|${ip}|${otpCode}`);
      const sent = await sendAdminOtpEmail(env, otpEmails, otpCode, ip, fetchImpl).catch(() => false);
      if (!sent) {
        return json({ error: 'Could not send 2FA verification email via Brevo. Check BREVO_API_KEY.' }, 502);
      }
      const primary = otpEmails[0];
      const [userPart, domainPart] = primary.split('@');
      const masked = `${userPart.slice(0, 2)}***@${domainPart}`;
      return json({
        ok: true,
        requiresOtp: true,
        challenge: `${otpExp}.${otpSig}`,
        emailHint: masked,
      });
    }

    const [otpExpStr, otpSig] = challenge.split('.');
    const otpExp = Number(otpExpStr);
    if (!otpExp || !otpSig || otpExp < nowSec) {
      return json({ error: 'Verification code expired. Please sign in again.' }, 401);
    }
    if (state.usedOtp.has(otpSig)) {
      return json({ error: 'This verification code has already been used or locked. Please sign in again.' }, 401);
    }
    const expectedOtpSig = await hmacSha256Hex(await signingKey(env), `admin-otp|${otpExp}|${ip}|${submittedOtp}`);
    if (!/^\d{6}$/.test(submittedOtp) || !timingSafeEqual(expectedOtpSig, otpSig)) {
      recordLoginFail(env, ip);
      const cFails = (state.otpFails.get(otpSig) || 0) + 1;
      state.otpFails.set(otpSig, cFails);
      if (cFails >= 5) {
        state.usedOtp.set(otpSig, otpExp);
        state.otpFails.delete(otpSig);
      }
      await new Promise((r) => setTimeout(r, 400));
      return json({ error: cFails >= 5 ? 'Too many wrong verification codes for this challenge. Request a new code.' : 'Invalid 6-digit verification code.' }, 401);
    }
    // Single-use OTP: invalidate challenge immediately so it cannot be replayed
    state.usedOtp.set(otpSig, otpExp);
    state.otpFails.delete(otpSig);
  }

  clearLoginFails(env, ip);
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const sig = await hmacSha256Hex(await signingKey(env), `admin|${exp}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookieHeader(`${exp}.${sig}`, SESSION_SECONDS) },
  });
}

async function logout(request, env) {
  // Only a logged-in admin can sign every session out (otherwise anyone could keep kicking you out of /admin).
  if ((await isAdmin(request, env)) && request.headers.get('X-Tamyiz-Admin') === '1' && env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.put) {
    try {
      await env.TAMYIZ_STORE.put('admin:revoked_before', String(Math.floor(Date.now() / 1000) + 1), { expirationTtl: SESSION_SECONDS });
    } catch {}
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookieHeader('', 0) },
  });
}

/** Admin's view of one ebook: everything except the file bytes. */
const adminView = (p) => ({ ...p, coverUrl: p.coverType ? `/api/cover/${p.id}?v=${p.updatedAt}` : null });

async function fileFrom(form, field, maxBytes, allowed, label) {
  const f = form.get(field);
  if (!f || typeof f === 'string' || !f.size) return null;
  if (f.size > maxBytes) throw new Error(`${label} is too big: ${(f.size / 1048576).toFixed(1)} MB (limit ${Math.round(maxBytes / 1048576)} MB).`);
  const bytes = await f.arrayBuffer();
  const type = sniff(bytes);
  if (!allowed.includes(type)) throw new Error(`${label} must be ${allowed.map((t) => t.split('/')[1].toUpperCase()).join(' or ')}.`);
  return { bytes, type, name: String(f.name || '').slice(0, 120), size: f.size };
}

async function saveProduct(request, env, id) {
  const kv = store(env);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Could not read the upload. Try again.' }, 400); }

  let fields, cover, thumb, pdf;
  try {
    fields = readFields(form);
    cover = await fileFrom(form, 'cover', MAX_COVER_BYTES, ['image/jpeg', 'image/png', 'image/webp'], 'The cover');
    thumb = await fileFrom(form, 'thumb', MAX_THUMB_BYTES, ['image/jpeg', 'image/png', 'image/webp'], 'The small cover');
    pdf = await fileFrom(form, 'pdf', MAX_PDF_BYTES, ['application/pdf'], 'The ebook file');
  } catch (err) {
    return json({ error: err.message }, 400);
  }

  const list = await loadCatalog(env);
  const existing = id ? findById(list, id) : null;
  if (id && !existing) return json({ error: 'That ebook no longer exists.' }, 404);

  const now = Date.now();
  const rec = existing ? { ...existing } : { id: newId(), createdAt: now };
  Object.assign(rec, fields, { updatedAt: now });
  rec.slug = uniqueSlug(list, form.get('slug') || rec.slug || fields.name, rec.id);

  if (cover) {
    await kv.put(`cover:${rec.id}`, cover.bytes, { metadata: { type: cover.type } });
    rec.coverType = cover.type;
    // A new cover makes the old small version wrong: replace it, or drop it until /admin makes a new one.
    if (thumb) {
      await kv.put(`thumb:${rec.id}`, thumb.bytes, { metadata: { type: thumb.type } });
      Object.assign(rec, { thumbType: thumb.type, thumbAt: now });
    } else if (rec.thumbType) {
      await kv.delete(`thumb:${rec.id}`);
      rec.thumbType = null;
    }
  }
  if (pdf) {
    await kv.put(`file:${rec.id}`, pdf.bytes, { metadata: { type: pdf.type, name: pdf.name, size: pdf.size } });
    Object.assign(rec, { fileName: pdf.name, fileSize: pdf.size, fileUploadedAt: now });
  }
  if (rec.status === 'on-sale' && !rec.fileSize) {
    rec.status = existing && existing.status !== 'on-sale' ? existing.status : 'soon';
    await saveCatalog(env, upsert(list, rec));
    return json({ error: 'Saved, but it can only be "On sale" once the PDF is uploaded. Status kept as ' + statusName(rec.status) + '.', product: adminView(rec) }, 422);
  }
  await saveCatalog(env, upsert(list, rec));
  return json({ ok: true, product: adminView(rec) }, existing ? 200 : 201);
}

const statusName = (s) => ({ draft: 'Draft', soon: 'Coming soon', 'on-sale': 'On sale' })[s] || s;
const upsert = (list, rec) => [rec, ...list.filter((p) => p.id !== rec.id)].sort((a, b) => b.createdAt - a.createdAt);

/** Store a small cover for an existing book (/admin makes these for books added before thumbnails existed). */
async function saveThumb(request, env, id) {
  const kv = store(env);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'Could not read the upload.' }, 400); }
  let thumb;
  try { thumb = await fileFrom(form, 'thumb', MAX_THUMB_BYTES, ['image/jpeg', 'image/png', 'image/webp'], 'The small cover'); }
  catch (err) { return json({ error: err.message }, 400); }
  if (!thumb) return json({ error: 'No image.' }, 400);
  const list = await loadCatalog(env);
  const rec = findById(list, id);
  if (!rec) return json({ error: 'That ebook no longer exists.' }, 404);
  if (!rec.coverType) return json({ error: 'This e-book has no cover.' }, 409);
  await kv.put(`thumb:${id}`, thumb.bytes, { metadata: { type: thumb.type } });
  const updated = { ...rec, thumbType: thumb.type, thumbAt: Date.now() };
  await saveCatalog(env, list.map((p) => (p.id === id ? updated : p)));
  return json({ ok: true, product: adminView(updated) });
}

async function deleteProduct(env, id) {
  const kv = store(env);
  const list = await loadCatalog(env);
  if (!findById(list, id)) return json({ error: 'That ebook no longer exists.' }, 404);
  await saveCatalog(env, list.filter((p) => p.id !== id));
  await Promise.all([kv.delete(`cover:${id}`), kv.delete(`thumb:${id}`), kv.delete(`file:${id}`)]);
  return json({ ok: true });
}

async function getOrders(request, env) {
  const kv = store(env);
  const indexRaw = await kv.get('orders:index');
  let orderIds = [];
  try { orderIds = indexRaw ? JSON.parse(indexRaw) : []; } catch { orderIds = []; }
  if (!Array.isArray(orderIds)) orderIds = [];

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').toLowerCase().trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));

  // Fetch orders from KV
  const records = [];
  for (const id of orderIds.slice(0, 150)) {
    const raw = await kv.get(`order:${id}`);
    if (raw) {
      try {
        const order = JSON.parse(raw);
        if (q) {
          const hay = `${order.orderId} ${order.referenceId || ''} ${order.paymentId || ''} ${order.email || ''} ${order.phone || ''} ${(order.items || []).map((i) => i.name).join(' ')}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        records.push(order);
      } catch {}
    }
    if (records.length >= limit) break;
  }
  return json({ orders: records, total: orderIds.length });
}

async function getCustomers(request, env) {
  const kv = store(env);
  const indexRaw = await kv.get('orders:index');
  let orderIds = [];
  try { orderIds = indexRaw ? JSON.parse(indexRaw) : []; } catch { orderIds = []; }
  if (!Array.isArray(orderIds)) orderIds = [];

  const customerMap = new Map();
  for (const id of orderIds) {
    const raw = await kv.get(`order:${id}`);
    if (!raw) continue;
    try {
      const ord = JSON.parse(raw);
      const email = (ord.email || '').trim().toLowerCase();
      const phone = (ord.phone || '').trim();
      const key = email || phone || id;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          email: email || '—',
          phone: phone || '—',
          ordersCount: 0,
          totalSpentINR: 0,
          lastOrderAt: ord.createdAt,
          orders: []
        });
      }
      const c = customerMap.get(key);
      c.ordersCount += 1;
      c.totalSpentINR += (ord.totalINR || 0);
      c.orders.push({ orderId: ord.orderId, referenceId: ord.referenceId, totalINR: ord.totalINR, createdAt: ord.createdAt });
      if (new Date(ord.createdAt) > new Date(c.lastOrderAt)) {
        c.lastOrderAt = ord.createdAt;
      }
    } catch {}
  }

  const customers = Array.from(customerMap.values()).sort((a, b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt));
  return json({ customers });
}

async function getOverview(env) {
  const catalog = await loadCatalog(env);
  const kv = store(env);
  const indexRaw = await kv.get('orders:index');
  let orderIds = [];
  try { orderIds = indexRaw ? JSON.parse(indexRaw) : []; } catch { orderIds = []; }
  if (!Array.isArray(orderIds)) orderIds = [];

  let totalRevenueINR = 0;
  let totalOrders = orderIds.length;
  const buyers = new Set();
  const productSalesMap = {};

  for (const id of orderIds) {
    const raw = await kv.get(`order:${id}`);
    if (raw) {
      try {
        const ord = JSON.parse(raw);
        if (ord.status === 'refunded') continue;
        totalRevenueINR += Math.max(0, (ord.totalINR || 0) - (ord.refundedINR || 0));
        if (ord.email) buyers.add(ord.email.toLowerCase());
        else if (ord.phone) buyers.add(ord.phone);
        for (const item of (ord.items || [])) {
          const pid = item.productId || item.id;
          productSalesMap[pid] = (productSalesMap[pid] || 0) + 1;
        }
      } catch {}
    }
  }

  const bestSellers = catalog
    .map((p) => ({ id: p.id, name: p.name, price: p.price, status: p.status, sales: productSalesMap[p.id] || 0 }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  return json({
    kpis: {
      totalRevenueINR,
      totalOrders,
      totalCustomers: buyers.size,
      totalProducts: catalog.length,
      onSaleProducts: catalog.filter((p) => p.status === 'on-sale').length,
      // The order list keeps the latest 500 orders; past that these totals only cover those 500 (the page says so).
      ordersCapped: totalOrders >= 500,
    },
    bestSellers
  });
}

async function resendOrder(request, env) {
  const kv = store(env);
  let body = {};
  try { body = await request.json(); } catch {}
  const orderId = body.orderId;
  if (!orderId) return json({ error: 'Order ID is required.' }, 400);

  const raw = await kv.get(`order:${orderId}`);
  if (!raw) return json({ error: 'Order not found.' }, 404);
  const ord = JSON.parse(raw);

  const origin = requestOrigin(request, env);
  const downloads = await Promise.all((ord.items || []).map(async (i) => ({
    productId: i.productId || i.id,
    name: i.name,
    variant: 'PDF',
    formatType: 'ebook',
    downloadUrl: origin + (await signDownload(env, i.productId || i.id, ord.paymentId || ord.orderId)),
    actionLabel: 'Download PDF ↗',
    specs: 'PDF e-book • DRM-free',
    price: i.price,
  })));

  let sent = false;
  if (ord.email) {
    sent = await sendReceiptEmail({
      email: ord.email,
      phone: ord.phone,
      referenceId: ord.referenceId || ord.orderId,
      paymentId: ord.paymentId || ord.orderId,
      totalINR: ord.totalINR || 0,
      downloads
    }, env).catch(() => false);
  }

  return json({ ok: true, sent: Boolean(sent), downloads });
}

async function createComplimentaryOrder(request, env) {
  const kv = store(env);
  let body = {};
  try { body = await request.json(); } catch {}
  const { email, phone, productId, note } = body;
  if (!email && !phone) return json({ error: 'Customer email or phone required.' }, 400);
  if (!productId) return json({ error: 'E-book product required.' }, 400);

  if (email && !STRICT_EMAIL_RE.test(String(email).trim().toLowerCase())) {
    return json({ error: 'Please enter a valid customer email address.' }, 400);
  }
  const catalog = await loadCatalog(env);
  const book = findById(catalog, productId);
  if (!book) return json({ error: 'Selected e-book not found.' }, 404);

  const orderId = `gift_${Date.now().toString(36)}`;
  const paymentId = `gift_pay_${Date.now().toString(36)}`;
  const referenceId = `TAMYIZ-GIFT-${Date.now().toString(36).toUpperCase()}`;
  const nowIso = new Date().toISOString();

  const origin = requestOrigin(request, env);
  const downloadUrl = origin + (await signDownload(env, book.id, paymentId));
  const downloads = [{
    productId: book.id,
    name: book.name,
    variant: 'PDF',
    formatType: 'ebook',
    downloadUrl,
    actionLabel: 'Download PDF ↗',
    specs: 'Complimentary Access • DRM-free',
    price: 0
  }];

  let receiptEmailed = false;
  if (email) {
    receiptEmailed = await sendReceiptEmail({
      email,
      phone: phone || '',
      referenceId,
      paymentId,
      totalINR: 0,
      downloads
    }, env).catch(() => false);
  }

  const orderData = {
    orderId,
    referenceId,
    paymentId,
    mode: 'complimentary_gift',
    amountPaise: 0,
    totalINR: 0,
    subtotalINR: book.price || 0,
    discountINR: book.price || 0,
    email: email || '',
    phone: phone || '',
    items: [{ productId: book.id, name: book.name, variant: 'PDF', price: 0 }],
    receiptEmailed: Boolean(receiptEmailed),
    note: note || 'Complimentary VIP Access',
    status: 'paid',
    createdAt: nowIso
  };

  await kv.put(`order:${orderId}`, JSON.stringify(orderData));
  const indexRaw = await kv.get('orders:index');
  let orderIndex = [];
  try { orderIndex = indexRaw ? JSON.parse(indexRaw) : []; } catch { orderIndex = []; }
  orderIndex.unshift(orderId);
  await kv.put('orders:index', JSON.stringify(orderIndex.slice(0, 500)));

  if (email && email.includes('@')) {
    const cleanE = email.trim().toLowerCase();
    const bRaw = await kv.get(`buyer-orders:${cleanE}`);
    let bOrders = [];
    try { bOrders = bRaw ? JSON.parse(bRaw) : []; } catch { bOrders = []; }
    if (!bOrders.includes(orderId)) {
      bOrders.unshift(orderId);
      await kv.put(`buyer-orders:${cleanE}`, JSON.stringify(bOrders)).catch(() => {});
    }
  }
  const cleanP = String(phone || '').replace(/[^0-9+]/g, '');
  if (cleanP.length >= 10) {
    const pKey = `buyer-phone:${cleanP.slice(-10)}`;
    const pRaw = await kv.get(pKey);
    let pOrders = [];
    try { pOrders = pRaw ? JSON.parse(pRaw) : []; } catch { pOrders = []; }
    if (!pOrders.includes(orderId)) {
      pOrders.unshift(orderId);
      await kv.put(pKey, JSON.stringify(pOrders)).catch(() => {});
    }
  }

  return json({ ok: true, order: orderData, downloadUrl });
}

async function getCoupons(env) {
  const kv = store(env);
  const raw = await kv.get('store:coupons');
  let coupons = {};
  try { coupons = raw ? JSON.parse(raw) : {}; } catch { coupons = {}; }
  return json({ coupons });
}

async function saveCoupon(request, env) {
  const kv = store(env);
  let body = {};
  try { body = await request.json(); } catch {}
  const { code, type, value, label, minOrder } = body;
  if (!code || typeof code !== 'string') return json({ error: 'Coupon code is required.' }, 400);
  const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
  if (cleanCode.length < 3) return json({ error: 'Coupon code must be at least 3 characters.' }, 400);

  const numVal = Number(value);
  if (!numVal || numVal < 1) return json({ error: 'Discount value must be a positive number.' }, 400);
  if (type !== 'flat' && numVal > 90) return json({ error: 'A percent coupon can be at most 90%.' }, 400);
  const min = Math.max(0, Math.round(Number(minOrder) || 0));

  const raw = await kv.get('store:coupons');
  let coupons = {};
  try { coupons = raw ? JSON.parse(raw) : {}; } catch { coupons = {}; }

  coupons[cleanCode] = {
    code: cleanCode,
    type: type === 'flat' ? 'flat' : 'percent',
    value: numVal,
    label: String(label || (type === 'flat' ? `₹${numVal} off` : `${numVal}% off`)).slice(0, 80),
    ...(type === 'flat' && min ? { minOrder: min } : {}),
    active: true,
    updatedAt: new Date().toISOString()
  };

  await kv.put('store:coupons', JSON.stringify(coupons));
  return json({ ok: true, coupon: coupons[cleanCode] });
}

async function deleteCoupon(env, code) {
  const kv = store(env);
  const cleanCode = (code || '').toUpperCase().trim();
  const raw = await kv.get('store:coupons');
  let coupons = {};
  try { coupons = raw ? JSON.parse(raw) : {}; } catch { coupons = {}; }

  delete coupons[cleanCode];
  await kv.put('store:coupons', JSON.stringify(coupons));
  return json({ ok: true });
}

async function getAnnouncement(env) {
  const kv = store(env);
  const raw = await kv.get('store:announcement');
  let announcement = null;
  try { announcement = raw ? JSON.parse(raw) : null; } catch {}
  return json({ announcement });
}

async function saveAnnouncement(request, env) {
  const kv = store(env);
  let body = {};
  try { body = await request.json(); } catch {}
  const { enabled, text, link, linkText } = body;

  const announcement = {
    enabled: Boolean(enabled),
    text: (text || '').trim().slice(0, 200),
    // Only web links or links inside the site (no javascript: or data: links in the banner).
    link: /^(https:\/\/|http:\/\/|\/(?!\/))/i.test(String(link || '').trim()) ? String(link).trim().slice(0, 150) : '',
    linkText: (linkText || '').trim().slice(0, 50),
    updatedAt: new Date().toISOString()
  };

  await kv.put('store:announcement', JSON.stringify(announcement));
  return json({ ok: true, announcement });
}

async function getLeads(request, env) {
  let leads = [];
  if (env.TAMYIZ_STORE && env.TAMYIZ_STORE.get) {
    try {
      const raw = await env.TAMYIZ_STORE.get('store:leads:index');
      if (raw) leads = JSON.parse(raw);
    } catch {}
  }
  return json({ ok: true, leads: Array.isArray(leads) ? leads : [] });
}

async function deleteLead(env, id) {
  if (!env.TAMYIZ_STORE) return json({ ok: true });
  try {
    await env.TAMYIZ_STORE.delete(`store:lead:${id}`);
    const raw = await env.TAMYIZ_STORE.get('store:leads:index');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const filtered = list.filter((l) => l.id !== id);
        await env.TAMYIZ_STORE.put('store:leads:index', JSON.stringify(filtered));
      }
    }
  } catch {}
  return json({ ok: true });
}

function getSettings(env) {
  return json({
    storeConfig: {
      hasStorage: Boolean(env.TAMYIZ_STORE),
      hasRazorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      razorpayKeyId: env.RAZORPAY_KEY_ID ? `${env.RAZORPAY_KEY_ID.slice(0, 8)}...` : 'Not configured',
      isSandbox: Boolean(env.TAMYIZ_SANDBOX === 'true' || env.TAMYIZ_SANDBOX === true),
      hasBrevo: Boolean(env.BREVO_API_KEY),
      hasResend: Boolean(env.RESEND_API_KEY),
      receiptSender: env.RECEIPT_FROM || 'tamyiz.co@gmail.com',
      hasDownloadSecret: Boolean(env.DOWNLOAD_SECRET),
      hasAdminSessionSecret: Boolean(env.ADMIN_SESSION_SECRET),
      hasAnalyticsToken: Boolean(env.CF_API_TOKEN),
      hasAdmin2FA: Boolean(env.ADMIN_OTP_EMAIL && env.BREVO_API_KEY),
      adminOtpEmail: env.ADMIN_OTP_EMAIL || '',
    }
  });
}

async function readJsonKV(kv, key, fallback) {
  try {
    const raw = await kv.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Backup: export all non-binary KV collections (no secrets/env vars) as a downloadable JSON file. */
async function backupStore(env) {
  const kv = store(env);
  const products = await loadCatalog(env);
  const films = await readJsonKV(kv, 'showcase:videos', []);
  const coupons = await readJsonKV(kv, 'store:coupons', {});
  const announcement = await readJsonKV(kv, 'store:announcement', null);
  const leads = await readJsonKV(kv, 'store:leads:index', []);
  const pendingReviews = await readJsonKV(kv, 'store:reviews:pending', []);
  const approvedReviews = await readJsonKV(kv, 'store:reviews:approved', []);

  const orderIds = await readJsonKV(kv, 'orders:index', []);
  const orders = [];
  for (const id of (Array.isArray(orderIds) ? orderIds : []).slice(0, 500)) {
    const ord = await readJsonKV(kv, `order:${id}`, null);
    if (ord) orders.push(ord);
  }

  const abandonedIds = await readJsonKV(kv, 'store:abandoned:index', []);
  const abandoned = [];
  for (const id of (Array.isArray(abandonedIds) ? abandonedIds : []).slice(0, 500)) {
    const rec = await readJsonKV(kv, `store:abandoned:${id}`, null);
    if (rec) abandoned.push(rec);
  }

  const day = new Date().toISOString().slice(0, 10);
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    products,
    films: Array.isArray(films) ? films : [],
    coupons,
    announcement,
    orders,
    leads: Array.isArray(leads) ? leads : [],
    reviews: {
      pending: Array.isArray(pendingReviews) ? pendingReviews : [],
      approved: Array.isArray(approvedReviews) ? approvedReviews : [],
    },
    abandoned,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tamyiz-kv-backup-${day}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Backup: download an e-book's stored PDF straight from KV (admin only). */
async function backupProductFile(env, id) {
  const kv = store(env);
  const product = findById(await loadCatalog(env), id);
  if (!product) return json({ error: 'That e-book no longer exists.' }, 404);
  const { value, metadata } = await kv.getWithMetadata(`file:${id}`, 'stream');
  if (!value) return json({ error: 'No PDF has been uploaded for this e-book.' }, 404);
  const safeSlug = String(product.slug || id).replace(/[^a-z0-9-]/gi, '-');
  return new Response(value, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeSlug}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(metadata && metadata.size ? { 'Content-Length': String(metadata.size) } : {}),
    },
  });
}

/** Routes for /api/admin/<rest>. */
export async function handleAdmin(request, env, rest, fetchImpl = fetch) {
  const method = request.method;
  try {
    if (rest === 'login' && method === 'POST') return await login(request, env, fetchImpl);
    if (rest === 'logout' && method === 'POST') return await logout(request, env);

    if (!(await isAdmin(request, env))) return json({ error: 'Please log in.' }, 401);
    if (method !== 'GET' && request.headers.get('X-Tamyiz-Admin') !== '1') return json({ error: 'Forbidden.' }, 403);

    if (rest === 'session' && method === 'GET') {
      return json({ ok: true, storage: Boolean(env.TAMYIZ_STORE) });
    }
    if (rest === 'stats' && method === 'GET') return await getStats(request, env);
    if (rest === 'overview' && method === 'GET') return await getOverview(env);
    if (rest === 'orders' && method === 'GET') return await getOrders(request, env);
    if (rest === 'orders/resend' && method === 'POST') return await resendOrder(request, env);
    if (rest === 'orders/gift' && method === 'POST') return await createComplimentaryOrder(request, env);
    if (rest === 'coupons' && method === 'GET') return await getCoupons(env);
    if (rest === 'coupons' && method === 'POST') return await saveCoupon(request, env);
    const cp = rest.match(/^coupons\/([A-Za-z0-9_-]{3,30})$/);
    if (cp && method === 'DELETE') return await deleteCoupon(env, cp[1]);
    if (rest === 'announcement' && method === 'GET') return await getAnnouncement(env);
    if (rest === 'announcement' && method === 'POST') return await saveAnnouncement(request, env);
    if (rest === 'leads' && method === 'GET') return await getLeads(request, env);
    const ld = rest.match(/^leads\/([A-Za-z0-9_-]{5,60})$/);
    if (ld && method === 'DELETE') return await deleteLead(env, ld[1]);
    if (rest === 'reviews' && method === 'GET') return await getAdminReviews(env);
    const rvApprove = rest.match(/^reviews\/([A-Za-z0-9_-]{5,50})\/approve$/);
    if (rvApprove && method === 'POST') return await approveReview(env, rvApprove[1]);
    const rvDelete = rest.match(/^reviews\/([A-Za-z0-9_-]{5,50})$/);
    if (rvDelete && method === 'DELETE') return await deleteReview(env, rvDelete[1]);
    if (rest === 'abandoned' && method === 'GET') return await getAdminAbandonedCarts(env);
    if (rest === 'abandoned/send' && method === 'POST') return await sendAbandonedCartRecoveryEmail(request, env);
    const abDel = rest.match(/^abandoned\/([A-Za-z0-9_-]{5,50})$/);
    if (abDel && method === 'DELETE') return await deleteAbandonedCart(env, abDel[1]);
    if (rest === 'films' && method === 'GET') return await handleAdminGetFilms(request, env);
    if (rest === 'films' && method === 'POST') return await handleAdminSaveFilm(request, env, null);
    if (rest === 'films/reorder' && method === 'POST') return await handleAdminReorderFilms(request, env);
    const flm = rest.match(/^films\/([a-z0-9_-]+)$/);
    if (flm && method === 'POST') return await handleAdminSaveFilm(request, env, flm[1]);
    if (flm && method === 'DELETE') return await handleAdminDeleteFilm(env, flm[1]);
    if (rest === 'customers' && method === 'GET') return await getCustomers(request, env);
    if (rest === 'settings' && method === 'GET') return getSettings(env);
    if (rest === 'backup' && method === 'GET') return await backupStore(env);
    if (rest === 'products' && method === 'GET') return json({ products: (await loadCatalog(env)).map(adminView) });
    if (rest === 'products' && method === 'POST') return await saveProduct(request, env, null);
    const f = rest.match(/^products\/([a-z0-9-]{3,40})\/file$/);
    if (f && method === 'GET') return await backupProductFile(env, f[1]);
    const t = rest.match(/^products\/([a-z0-9-]{3,40})\/thumb$/);
    if (t && method === 'POST') return await saveThumb(request, env, t[1]);
    const m = rest.match(/^products\/([a-z0-9-]{3,40})$/);
    if (m && method === 'POST') return await saveProduct(request, env, m[1]);
    if (m && method === 'DELETE') return await deleteProduct(env, m[1]);
    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    if (err instanceof StoreMissing) return json({ error: err.message }, 503);
    console.error('Admin error:', err);
    return json({ error: 'Something went wrong on the server. Try again.' }, 500);
  }
}
