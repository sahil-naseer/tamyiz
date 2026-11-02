import { json, signDownload, escapeHtml } from './payments.js';

export async function handleRecoverDownloads(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed. Use POST.' }, 405);
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
      if (cleanEmail && orderEmail && orderEmail === cleanEmail) {
        matched = true;
      }
      if (!matched && cleanPhone && cleanPhone.length >= 8 && orderPhone && orderPhone.endsWith(cleanPhone.slice(-10))) {
        matched = true;
      }

      if (matched) {
        matchingOrders.push(ord);
      }
    } catch {}
  }

  if (matchingOrders.length === 0) {
    return json({
      ok: false,
      error: 'No active purchases were found under this email or mobile number. If you used a different email, please try again or contact WhatsApp support (+91 95417 22379).'
    }, 404);
  }

  const origin = new URL(request.url).origin;
  const books = [];
  const seenProds = new Set();

  for (const ord of matchingOrders) {
    const items = Array.isArray(ord.items) ? ord.items : [];
    for (const item of items) {
      const prodId = item.productId || item.id;
      if (!prodId || seenProds.has(prodId)) continue;
      seenProds.add(prodId);

      const downloadPath = await signDownload(env, prodId, ord.paymentId || ord.orderId);
      books.push({
        productId: prodId,
        name: item.name || 'TAMYIZ Monograph',
        downloadUrl: origin + downloadPath,
        purchasedAt: ord.createdAt,
        orderId: ord.orderId,
      });
    }
  }

  // Best effort email delivery of recovery links
  const targetEmail = cleanEmail || matchingOrders[0].email;
  if (targetEmail && (env.BREVO_API_KEY || env.RESEND_API_KEY)) {
    try {
      sendRecoveryEmail(env, targetEmail, books, fetchImpl).catch(() => {});
    } catch {}
  }

  return json({
    ok: true,
    message: `Found ${books.length} e-book${books.length === 1 ? '' : 's'} in your library.`,
    email: targetEmail,
    books,
  });
}

async function sendRecoveryEmail(env, to, books, fetchImpl = fetch) {
  const fromEmail = String(env.RECEIPT_FROM || 'tamyiz.co@gmail.com').replace(/^.*<|>.*$/g, '').trim();
  const subject = `Your TAMYIZ Digital Library Access Links`;
  const text = [
    `TAMYIZ™ ATELIER — LIBRARY RECOVERY`,
    ``,
    `Here are your secure digital download links:`,
    ``,
    ...books.map((b) => `• ${b.name}\n  Download: ${b.downloadUrl}\n`),
    ``,
    `Links are valid for 1 year. For questions or revision updates, WhatsApp us: https://wa.me/919541722379`,
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
              Your E-Book Library Recovery
            </h1>
            <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 0 0 24px;">
              Here are your active, verified download links for your purchased TAMYIZ editions:
            </p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${books.map((b) => `
                <div style="background: #FAF9F6; border: 1px solid rgba(11,11,11,0.1); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                  <strong style="display: block; font-size: 15px; color: #0B0B0B; margin-bottom: 6px;">${escapeHtml(b.name)}</strong>
                  <a href="${b.downloadUrl}" style="display: inline-block; background: #0B0B0B; color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 6px; letter-spacing: 0.5px;">
                    Download PDF e-book ↓
                  </a>
                </div>
              `).join('')}
            </div>
            <p style="font-size: 12px; color: #888; margin-top: 24px;">
              Links are secured with HMAC and renewed for 12 months. Save this email for your records.
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
