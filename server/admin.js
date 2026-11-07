/**
 * /api/admin/*: the private side of /admin.
 *
 * Login: the password is the Cloudflare secret TAMYIZ_ADMIN_PASSWORD (or ADMIN_PASSWORD; 12+ characters). A correct password gets a
 * signed cookie (HttpOnly, Secure, SameSite=Strict, 12 hours). Changing ADMIN_PASSWORD logs everyone out.
 * Ten wrong passwords from one address lock logins from it for 15 minutes.
 * Every change also needs the header X-Tamyiz-Admin: 1 (pages on other sites can't send it).
 */
import { json, hmacSha256Hex, timingSafeEqual, signDownload, sendReceiptEmail } from './payments.js';
import {
  loadCatalog, saveCatalog, store, findById, readFields, sniff, newId, uniqueSlug,
  MAX_PDF_BYTES, MAX_COVER_BYTES, StoreMissing,
} from './catalog.js';
import { getStats } from './stats.js';
import { getAdminReviews, approveReview, deleteReview } from './reviews.js';
import { getAdminAbandonedCarts, sendAbandonedCartRecoveryEmail, deleteAbandonedCart } from './abandoned.js';

const COOKIE = 'tmz_admin';
const SESSION_SECONDS = 12 * 60 * 60;
const MIN_PASSWORD = 12;
const MAX_FAILS = 10;
const MAX_THUMB_BYTES = 400 * 1024;

// TAMYIZ_ADMIN_PASSWORD is accepted too: Cloudflare's dashboard once kept a ghost "ADMIN_PASSWORD" it wouldn't show.
const adminPassword = (env) => String(env.TAMYIZ_ADMIN_PASSWORD || env.ADMIN_PASSWORD || '');
const passwordReady = (env) => adminPassword(env).length >= MIN_PASSWORD;

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
  const expected = await hmacSha256Hex(adminPassword(env), `admin|${exp}`);
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

async function login(request, env) {
  if (!passwordReady(env)) {
    return json({ error: `Admin password not set. In Cloudflare add the secret TAMYIZ_ADMIN_PASSWORD (at least ${MIN_PASSWORD} characters).` }, 503);
  }
  const kv = env.TAMYIZ_STORE;
  const failKey = `login-fail:${clientIp(request)}`;
  const fails = kv ? Number(await kv.get(failKey)) || 0 : 0;
  if (fails >= MAX_FAILS) return json({ error: 'Too many wrong passwords. Try again in 15 minutes.' }, 429);

  let body = {};
  try { body = await request.json(); } catch {}
  // Compare hashes, so the comparison takes the same time whatever the password length.
  const ok = timingSafeEqual(await sha256Hex(body.password || ''), await sha256Hex(adminPassword(env)));
  if (!ok) {
    if (kv) await kv.put(failKey, String(fails + 1), { expirationTtl: 15 * 60 });
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'Wrong password.' }, 401);
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const sig = await hmacSha256Hex(adminPassword(env), `admin|${exp}`);
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
        totalRevenueINR += (ord.totalINR || 0);
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

  const origin = new URL(request.url).origin;
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

  const catalog = await loadCatalog(env);
  const book = findById(catalog, productId);
  if (!book) return json({ error: 'Selected e-book not found.' }, 404);

  const orderId = `gift_${Date.now().toString(36)}`;
  const paymentId = `gift_pay_${Date.now().toString(36)}`;
  const referenceId = `TAMYIZ-GIFT-${Date.now().toString(36).toUpperCase()}`;
  const nowIso = new Date().toISOString();

  const origin = new URL(request.url).origin;
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
      hasAnalyticsToken: Boolean(env.CF_API_TOKEN),
    }
  });
}

/** Routes for /api/admin/<rest>. */
export async function handleAdmin(request, env, rest) {
  const method = request.method;
  try {
    if (rest === 'login' && method === 'POST') return await login(request, env);
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
    if (rest === 'customers' && method === 'GET') return await getCustomers(request, env);
    if (rest === 'settings' && method === 'GET') return getSettings(env);
    if (rest === 'products' && method === 'GET') return json({ products: (await loadCatalog(env)).map(adminView) });
    if (rest === 'products' && method === 'POST') return await saveProduct(request, env, null);
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
