import { json, signDownload, escapeHtml } from './payments.js';

export function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user[0]}***${user[user.length - 1]}@${domain}`;
}

export async function handleRecoverDownloads(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed. Use POST.' }, 405);
  }

  // Rate limiting per IP to prevent automated library scanning
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get && ip !== 'local') {
    const rateKey = `recover-rate:${ip}`;
    const recent = Number(await env.TAMYIZ_STORE.get(rateKey)) || 0;
    if (recent >= 8) {
      return json({ error: 'Too many recovery attempts. Please wait 15 minutes before trying again or message us on WhatsApp.' }, 429);
    }
    await env.TAMYIZ_STORE.put(rateKey, String(recent + 1), { expirationTtl: 15 * 60 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }

  const { email, phone } = body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');

  if (!cleanEmail && !cleanPhone) {
    return json({ error: 'Please enter your purchase email address or mobile number.' }, 400);
  }

  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  if (!env || !env.TAMYIZ_STORE) {
    return json({ error: 'Store storage is currently unavailable. Please contact WhatsApp support.' }, 503);
  }

  if (!env.BREVO_API_KEY && !env.RESEND_API_KEY) {
    return json({ error: 'Email delivery is not set up yet. WhatsApp us on +91 95417 22379 with your payment ID and we will send your files.' }, 503);
  }

  const kv = env.TAMYIZ_STORE;
  let orderIds = [];
  try {
    const raw = await kv.get('orders:index');
    if (raw) orderIds = JSON.parse(raw);
  } catch {}
  if (!Array.isArray(orderIds)) orderIds = [];

  const matchingOrders = [];
  for (const id of orderIds) {
    try {
      const raw = await kv.get(`order:${id}`);
      if (!raw) continue;
      const ord = JSON.parse(raw);
      const isPaid = ord.status === 'paid' || ord.status === 'gift' || Boolean(ord.paymentId);
      if (!isPaid) continue;

      const orderEmail = String(ord.email || '').trim().toLowerCase();
      const orderPhone = String(ord.phone || '').replace(/[^0-9]/g, '');

      let matched = false;
      if (cleanEmail && orderEmail && orderEmail === cleanEmail) matched = true;
      // Phone: the last 10 digits must match exactly (no partial-number searches).
      if (!matched && cleanPhone.length >= 10 && orderPhone.length >= 10 && orderPhone.slice(-10) === cleanPhone.slice(-10)) matched = true;
      if (matched && orderEmail.includes('@')) matchingOrders.push(ord);
    } catch {}
  }

  // Security (7 Nov 2026): links are NEVER shown on screen and the answer is the same whether or not a purchase
  // was found. They go only to the email address saved on the order, so knowing someone's email or phone
  // number is not enough to download their books or to learn what they bought.
  const origin = new URL(request.url).origin;
  const byEmail = new Map();
  for (const ord of matchingOrders) {
    const to = String(ord.email).trim().toLowerCase();
    if (!byEmail.has(to)) byEmail.set(to, { books: [], seen: new Set() });
    const entry = byEmail.get(to);
    for (const item of Array.isArray(ord.items) ? ord.items : []) {
      const prodId = item.productId || item.id;
      if (!prodId || entry.seen.has(prodId)) continue;
      entry.seen.add(prodId);
      entry.books.push({
        name: item.name || 'Your TAMYIZ e-book',
        downloadUrl: origin + (await signDownload(env, prodId, ord.paymentId || ord.orderId)),
      });
    }
  }
  for (const [to, { books }] of byEmail) {
    if (books.length) await sendRecoveryEmail(env, to, books, fetchImpl).catch(() => false);
  }

  return json({
    ok: true,
    message: 'If this matches a purchase, we have emailed the download links to the email address used at checkout. Check your inbox (and spam folder) in a few minutes. Nothing arrived? WhatsApp us on +91 95417 22379 with your payment ID.',
  });
}

async function sendRecoveryEmail(env, to, books, fetchImpl = fetch) {
  const fromEmail = String(env.RECEIPT_FROM || 'tamyiz.co@gmail.com').replace(/^.*<|>.*$/g, '').trim();
  const subject = 'Your TAMYIZ download links';
  const text = [
    `TAMYIZ — your download links`,
    ``,
    `Here are your secure digital download links:`,
    ``,
    ...books.map((b) => `• ${b.name}\n  Download: ${b.downloadUrl}\n`),
    ``,
    `Links are valid for 1 year. Questions? WhatsApp us: https://wa.me/919541722379`,
    ``,
    `TAMYIZ`
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
              TAMYIZ
            </div>
            <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 16px; color: #0B0B0B; line-height: 1.3;">
              Your download links
            </h1>
            <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0 0 24px;">
              Someone (hopefully you) asked for the download links to your TAMYIZ e-books. Here they are:
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${books.map((b) => `
                <div style="background: #FAF9F6; border: 1px solid rgba(11,11,11,0.1); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                  <strong style="display: block; font-size: 15px; color: #0B0B0B; margin-bottom: 6px;">${escapeHtml(b.name)}</strong>
                  <a href="${escapeHtml(b.downloadUrl)}" style="display: inline-block; background: #0B0B0B; color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 6px; letter-spacing: 0.5px;">
                    Download PDF e-book ↓
                  </a>
                </div>
              `).join('')}
            </div>
            <p style="font-size: 12px; color: #888; margin-top: 24px;">
              The links work for one year. If you did not ask for this email, you can ignore it.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

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
    return res.ok;
  } catch (err) {
    console.warn('Recovery email send error:', err.message);
    return false;
  }
}

