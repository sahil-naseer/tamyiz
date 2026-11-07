import { json } from './payments.js';
import { loadCatalog, findById, findBySlug, publicProduct } from './catalog.js';

export async function handleSampleLead(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed. Use POST.' }, 405);
  }

  // Rate limiting per IP to prevent email quota exhaustion
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get && ip !== 'local') {
    const rateKey = `sample-rate:${ip}`;
    const recent = Number(await env.TAMYIZ_STORE.get(rateKey)) || 0;
    if (recent >= 10) {
      return json({ error: 'Too many sample requests. Please wait a few minutes before trying again.' }, 429);
    }
    await env.TAMYIZ_STORE.put(rateKey, String(recent + 1), { expirationTtl: 15 * 60 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }

  const { productId, email, phone, name } = body || {};

  const cleanEmail = String(email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  if (!productId || typeof productId !== 'string' || productId.length > 80) {
    return json({ error: 'Product ID is required.' }, 400);
  }

  const list = await loadCatalog(env);
  const rawProduct = findById(list, productId) || findBySlug(list, productId);
  // Drafts are private to /admin: never hand out their text (7 Nov 2026).
  if (!rawProduct || rawProduct.status === 'draft') {
    return json({ error: 'Book not found.' }, 404);
  }

  const pub = publicProduct(rawProduct);
  const now = new Date();
  const leadId = `lead_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;

  const lead = {
    id: leadId,
    productId: pub.id,
    productName: pub.name,
    productSlug: pub.slug,
    email: cleanEmail.slice(0, 100),
    phone: String(phone || '').replace(/[^0-9+]/g, '').slice(0, 16),
    name: String(name || '').trim().slice(0, 100),
    createdAt: now.toISOString(),
  };

  let alreadyLead = false;
  if (env.TAMYIZ_STORE) {
    try {
      // Store full lead record
      await env.TAMYIZ_STORE.put(`store:lead:${leadId}`, JSON.stringify(lead));

      // Update leads index
      let leadsIndex = [];
      const raw = await env.TAMYIZ_STORE.get('store:leads:index');
      if (raw) {
        try { leadsIndex = JSON.parse(raw); } catch {}
      }
      if (!Array.isArray(leadsIndex)) leadsIndex = [];
      alreadyLead = leadsIndex.some((l) => l && l.email === lead.email);

      leadsIndex.unshift({
        id: leadId,
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        productName: lead.productName,
        productId: lead.productId,
        createdAt: lead.createdAt,
      });

      if (leadsIndex.length > 1000) leadsIndex = leadsIndex.slice(0, 1000);
      await env.TAMYIZ_STORE.put('store:leads:index', JSON.stringify(leadsIndex));
    } catch (kvErr) {
      console.warn('Could not persist sample lead in KV:', kvErr.message);
    }
  }

  // One welcome email per address (so the form can't be used to flood someone's inbox or burn the email quota).
  // Awaited: Cloudflare may cancel work that is still running after the response is sent.
  if (!alreadyLead) await sendSampleWelcomeEmail(env, cleanEmail, pub).catch(() => false);

  return json({
    ok: true,
    message: 'Sample unlocked successfully.',
    leadId,
    sample: {
      productId: pub.id,
      bookName: pub.name,
      tagline: pub.tagline,
      description: pub.description,
      chapter: pub.sampleExcerpt ? pub.sampleExcerpt.chapter : 'Chapter 01',
      subtitle: pub.sampleExcerpt ? pub.sampleExcerpt.subtitle : 'Introduction & Essential Tenets',
      text: pub.sampleExcerpt ? pub.sampleExcerpt.text : pub.description,
      tableOfContents: pub.tableOfContents,
      price: pub.price,
      slug: pub.slug,
      cover: (pub.images && pub.images[0]) || pub.thumb || '/og/tamyiz.jpg',
    },
  });
}

/** Sends a welcome email with a 10% coupon code to prospective readers */
export async function sendSampleWelcomeEmail(env, to, product, fetchImpl = fetch) {
  if (!env || (!env.BREVO_API_KEY && !env.RESEND_API_KEY)) return false;
  const fromEmail = String(env.RECEIPT_FROM || 'tamyiz.co@gmail.com').replace(/^.*<|>.*$/g, '').trim();
  const plainName = String(product.name || '').replace(/&(amp|lt|gt|quot|#39);/g, (m, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[c]);
  const subject = `Your sample of "${plainName}" + a welcome gift from TAMYIZ`;
  const bookUrl = `https://tamyiz.pages.dev/edition/${product.slug || product.id}`;
  const text = [
    `TAMYIZ`,
    ``,
    `Thank you for requesting a sample of "${plainName}".`,
    `You can read the sample again, or see what is inside the full e-book, here:`,
    `${bookUrl}`,
    ``,
    `----------------------------------------------------`,
    `WELCOME GIFT: 10% OFF THE FULL E-BOOK`,
    `Use Coupon Code: SAMPLE10 at checkout`,
    `----------------------------------------------------`,
    ``,
    `TAMYIZ e-books are DRM-free PDFs with an instant download after payment.`,
    ``,
    `Questions? WhatsApp us: https://wa.me/919541722379`,
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
              Your Sample of "${product.name}"
            </h1>
            <p style="font-size: 15px; line-height: 1.6; color: #444; margin: 0 0 20px;">
              Thank you for reading the sample. You can come back to it anytime, or see what is inside the full e-book.
            </p>
            <div style="background: #FAF9F6; border: 1.5px dashed #0B0B0B; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #C00; display: block; margin-bottom: 6px;">
                Welcome Reader Gift
              </span>
              <div style="font-size: 24px; font-family: monospace; font-weight: 800; color: #0B0B0B; letter-spacing: 2px; margin-bottom: 6px;">
                SAMPLE10
              </div>
              <p style="font-size: 13px; color: #555; margin: 0;">
                Get <strong>10% off</strong> the full edition at checkout.
              </p>
            </div>
            <div style="text-align: center; margin: 28px 0 20px;">
              <a href="${bookUrl}" style="display: inline-block; background: #0B0B0B; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 999px; letter-spacing: 0.5px;">
                See the full e-book →
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid rgba(11,11,11,0.08); margin: 28px 0 20px;" />
            <p style="font-size: 12px; line-height: 1.5; color: #888; margin: 0;">
              TAMYIZ e-books are DRM-free PDFs that read on phones, tablets, laptops and Kindle. Questions? WhatsApp us.
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
    console.warn('Sample welcome email error:', err.message);
    return false;
  }
}

