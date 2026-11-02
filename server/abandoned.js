import { json, escapeHtml } from './payments.js';

function getAbandonedId(email) {
  const clean = String(email || '').trim().toLowerCase();
  return 'ab_' + btoa(unescape(encodeURIComponent(clean))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}

export async function handleTrackAbandonedCart(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed. Use POST.' }, 405);
  }

  // Rate limiting per IP to prevent spamming cart records
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get && ip !== 'local') {
    const rateKey = `abandoned-rate:${ip}`;
    const recent = Number(await env.TAMYIZ_STORE.get(rateKey)) || 0;
    if (recent >= 20) {
      return json({ ok: true, rateLimited: true });
    }
    await env.TAMYIZ_STORE.put(rateKey, String(recent + 1), { expirationTtl: 15 * 60 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }

  const { email, phone, items, subtotal, total, coupon } = body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').trim();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return json({ error: 'Valid email required' }, 400);
  }

  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'No items in cart' }, 400);
  }

  if (!env || !env.TAMYIZ_STORE) {
    return json({ ok: true, stored: false });
  }

  const kv = env.TAMYIZ_STORE;
  const id = getAbandonedId(cleanEmail);
  const now = new Date().toISOString();

  // Check if existing
  let existing = null;
  try {
    const raw = await kv.get(`store:abandoned:${id}`);
    if (raw) existing = JSON.parse(raw);
  } catch {}

  // If already recovered (they bought it), don't reopen as abandoned unless 7 days have passed
  if (existing && existing.status === 'recovered') {
    const lastRecovered = new Date(existing.recoveredAt || 0).getTime();
    if (Date.now() - lastRecovered < 7 * 24 * 60 * 60 * 1000) {
      return json({ ok: true, id, status: 'already-recovered' });
    }
  }

  const record = {
    id,
    email: cleanEmail,
    phone: cleanPhone || existing?.phone || '',
    items: items.map((i) => ({
      productId: i.productId || i.id,
      name: i.name,
      price: i.price,
    })),
    subtotal: Number(subtotal) || 0,
    total: Number(total) || 0,
    coupon: coupon || null,
    status: existing?.status === 'recovered' ? 'abandoned' : (existing?.status || 'abandoned'),
    emailSent: existing ? Boolean(existing.emailSent) : false,
    emailedAt: existing?.emailedAt || null,
    createdAt: existing?.createdAt || now,
    lastSeenAt: now,
  };

  try {
    await kv.put(`store:abandoned:${id}`, JSON.stringify(record));

    // Update index (unique IDs, newest first)
    let index = [];
    const rawIndex = await kv.get('store:abandoned:index');
    if (rawIndex) {
      try { index = JSON.parse(rawIndex); } catch {}
    }
    if (!Array.isArray(index)) index = [];

    // Filter out existing id and prepend
    index = [id, ...index.filter((x) => x !== id)].slice(0, 500);
    await kv.put('store:abandoned:index', JSON.stringify(index));
  } catch (err) {
    console.warn('Could not store abandoned cart:', err.message);
  }

  return json({ ok: true, id });
}

export async function markCartRecovered(env, email) {
  if (!env || !env.TAMYIZ_STORE || !email) return;
  const id = getAbandonedId(email);
  try {
    const raw = await env.TAMYIZ_STORE.get(`store:abandoned:${id}`);
    if (raw) {
      const rec = JSON.parse(raw);
      rec.status = 'recovered';
      rec.recoveredAt = new Date().toISOString();
      await env.TAMYIZ_STORE.put(`store:abandoned:${id}`, JSON.stringify(rec));
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Admin Operations
// ---------------------------------------------------------------------------

export async function getAdminAbandonedCarts(env) {
  if (!env || !env.TAMYIZ_STORE) {
    return json({ ok: true, list: [], totalLostRevenue: 0 });
  }

  const kv = env.TAMYIZ_STORE;
  let index = [];
  try {
    const rawIndex = await kv.get('store:abandoned:index');
    if (rawIndex) index = JSON.parse(rawIndex);
  } catch {}
  if (!Array.isArray(index)) index = [];

  const list = [];
  let totalLostRevenue = 0;

  for (const id of index.slice(0, 150)) {
    try {
      const raw = await kv.get(`store:abandoned:${id}`);
      if (!raw) continue;
      const rec = JSON.parse(raw);
      list.push(rec);
      if (rec.status !== 'recovered') {
        totalLostRevenue += (rec.total || rec.subtotal || 0);
      }
    } catch {}
  }

  return json({
    ok: true,
    list,
    totalLostRevenue,
    totalCount: list.length,
    recoveredCount: list.filter((r) => r.status === 'recovered').length,
  });
}

export async function sendAbandonedCartRecoveryEmail(request, env, fetchImpl = fetch) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { id } = body || {};
  if (!id) return json({ error: 'Missing abandoned cart ID' }, 400);

  if (!env || !env.TAMYIZ_STORE) return json({ error: 'Storage unavailable' }, 503);
  const kv = env.TAMYIZ_STORE;

  const raw = await kv.get(`store:abandoned:${id}`);
  if (!raw) return json({ error: 'Cart record not found' }, 404);

  const rec = JSON.parse(raw);
  const targetEmail = rec.email;
  const items = rec.items || [];
  const resumeParam = encodeURIComponent(items.map((i) => i.productId).join(','));
  const resumeUrl = `https://tamyiz.pages.dev/checkout?resume=${resumeParam}&coupon=SAMPLE10`;

  const fromEmail = String(env.RECEIPT_FROM || 'tamyiz.co@gmail.com').replace(/^.*<|>.*$/g, '').trim();
  const subject = `Your TAMYIZ e-books are waiting (+ 10% discount reserved)`;

  const text = [
    `TAMYIZ™ ATELIER`,
    ``,
    `You left items in your reading bag:`,
    ...items.map((i) => `• ${i.name} (₹${i.price})`),
    ``,
    `We have reserved your bag and applied a 10% discount for you:`,
    `Resume Order & Claim 10% Off: ${resumeUrl}`,
    ``,
    `Coupon code: SAMPLE10`,
    ``,
    `All TAMYIZ monographs are DRM-free and ready for instant digital reading.`,
    ``,
    `TAMYIZ — Distinction is quiet.`
  ].join('\n');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F7F7F5; color: #0B0B0B;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background: #FFFFFF; border-radius: 12px; border: 1px solid rgba(11,11,11,0.1); overflow: hidden; padding: 32px;">
        <tr>
          <td>
            <div style="font-family: monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #767670; margin-bottom: 8px;">
              TAMYIZ™ ATELIER
            </div>
            <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #0B0B0B; line-height: 1.3;">
              Your E-Books Are Waiting In Your Bag
            </h1>
            <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
              You were exploring our publications but didn't finish checking out. We have saved your bag and reserved an exclusive <strong>10% discount</strong> for you.
            </p>
            <div style="background: #FAF9F6; border: 1px solid rgba(11,11,11,0.1); border-radius: 8px; padding: 18px; margin-bottom: 24px;">
              <div style="font-size: 11px; font-family: monospace; text-transform: uppercase; letter-spacing: 1px; color: #767670; margin-bottom: 8px;">Reserved Items:</div>
              ${items.map((i) => `
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px;">
                  <strong style="color: #0B0B0B;">${escapeHtml(i.name)}</strong>
                  <span style="color: #555;">₹${i.price}</span>
                </div>
              `).join('')}
            </div>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resumeUrl}" style="display: inline-block; background: #0B0B0B; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 32px; border-radius: 999px; letter-spacing: 0.5px;">
                Resume My Bag With 10% Off →
              </a>
            </div>
            <p style="font-size: 12px; text-align: center; color: #767670; margin: 0;">
              Or enter coupon <strong>SAMPLE10</strong> at checkout.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  if (env.BREVO_API_KEY || env.RESEND_API_KEY) {
    try {
      const res = env.BREVO_API_KEY
        ? await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender: { name: 'TAMYIZ', email: fromEmail }, to: [{ email: targetEmail }], replyTo: { email: 'tamyiz.co@gmail.com', name: 'TAMYIZ' }, subject, htmlContent: html, textContent: text }),
        })
        : await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env.RECEIPT_FROM || 'TAMYIZ <onboarding@resend.dev>', to: [targetEmail], reply_to: 'tamyiz.co@gmail.com', subject, html, text }),
        });
      if (!res.ok) console.warn('Recovery email send response code:', res.status);
    } catch (err) {
      console.warn('Recovery email send error:', err.message);
    }
  }

  // Update record
  rec.emailSent = true;
  rec.emailedAt = new Date().toISOString();
  await kv.put(`store:abandoned:${id}`, JSON.stringify(rec));

  return json({ ok: true, message: `Recovery email sent to ${targetEmail}` });
}

export async function deleteAbandonedCart(env, id) {
  if (!env || !env.TAMYIZ_STORE) return json({ ok: true });
  const kv = env.TAMYIZ_STORE;
  try {
    await kv.delete(`store:abandoned:${id}`);
    const raw = await kv.get('store:abandoned:index');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const filtered = list.filter((x) => x !== id);
        await kv.put('store:abandoned:index', JSON.stringify(filtered));
      }
    }
  } catch {}
  return json({ ok: true });
}

