import { json } from './payments.js';
import { loadCatalog, findById, findBySlug, publicProduct } from './catalog.js';

export async function handleSampleLead(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed. Use POST.' }, 405);
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

  if (!productId) {
    return json({ error: 'Product ID is required.' }, 400);
  }

  const list = await loadCatalog(env);
  const rawProduct = findById(list, productId) || findBySlug(list, productId);
  if (!rawProduct) {
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
    phone: String(phone || '').trim().slice(0, 30),
    name: String(name || '').trim().slice(0, 100),
    ip: request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'local',
    userAgent: (request.headers.get('user-agent') || '').slice(0, 150),
    createdAt: now.toISOString(),
  };

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
