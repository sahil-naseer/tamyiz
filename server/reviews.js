import { json, escapeHtml } from './payments.js';
import { loadCatalog, findById, findBySlug } from './catalog.js';

export async function handleReviews(request, env) {
  const method = request.method;
  const url = new URL(request.url);

  if (method === 'GET') {
    const prodId = url.searchParams.get('product') || url.searchParams.get('productId');
    return getApprovedReviews(env, prodId);
  }

  if (method === 'POST') {
    return submitReview(request, env);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

async function getApprovedReviews(env, productId) {
  let list = [];
  if (env && env.TAMYIZ_STORE) {
    try {
      const raw = await env.TAMYIZ_STORE.get('store:reviews:approved');
      if (raw) list = JSON.parse(raw);
    } catch {}
  }
  if (!Array.isArray(list)) list = [];

  let filtered = list;
  if (productId) {
    const cleanId = String(productId).trim();
    filtered = list.filter((r) => r.productId === cleanId);
  }

  const count = filtered.length;
  const sum = filtered.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  // No reviews = no rating (never a made-up 5.0).
  const averageRating = count > 0 ? Number((sum / count).toFixed(1)) : null;

  // Public view only: never the reviewer's email (privacy, 7 Nov 2026).
  const reviews = filtered.map((r) => ({
    id: r.id,
    productId: r.productId,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    verifiedBuyer: Boolean(r.verifiedBuyer),
    createdAt: r.createdAt,
  }));

  return json({ ok: true, reviews, count, averageRating });
}

async function submitReview(request, env) {
  // Rate limiting per IP to prevent review spamming
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get && ip !== 'local') {
    const rateKey = `review-rate:${ip}`;
    const recent = Number(await env.TAMYIZ_STORE.get(rateKey)) || 0;
    if (recent >= 5) {
      return json({ error: 'Too many review submissions. Please wait a while before submitting another review.' }, 429);
    }
    await env.TAMYIZ_STORE.put(rateKey, String(recent + 1), { expirationTtl: 15 * 60 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }

  const { productId, name, email, rating, comment } = body || {};

  const cleanName = String(name || '').trim().slice(0, 60);
  const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 100);
  const cleanComment = String(comment || '').trim().slice(0, 1000);
  const numRating = parseInt(rating, 10);
  if (!(numRating >= 1 && numRating <= 5)) return json({ error: 'Please choose a rating from 1 to 5 stars.' }, 400);

  if (!productId || typeof productId !== 'string' || productId.length > 80) return json({ error: 'Product ID is required.' }, 400);
  if (cleanName.length < 2) return json({ error: 'Please enter your name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (cleanComment.length < 10) {
    return json({ error: 'Please write at least a sentence or two (10+ characters).' }, 400);
  }

  // Check if book exists
  const catalog = await loadCatalog(env);
  const book = findById(catalog, productId) || findBySlug(catalog, productId);
  // Reviews only for e-books that are in the shop (not drafts, not made-up ids).
  if (!book || book.status === 'draft') return json({ error: 'That e-book was not found.' }, 404);
  const bookName = book.name;

  // Check if verified buyer from orders:index
  let isVerifiedBuyer = false;
  if (env && env.TAMYIZ_STORE) {
    try {
      const rawIdx = await env.TAMYIZ_STORE.get('orders:index');
      const orderIds = rawIdx ? JSON.parse(rawIdx) : [];
      if (Array.isArray(orderIds)) {
        for (const oId of orderIds.slice(0, 100)) {
          const oRaw = await env.TAMYIZ_STORE.get(`order:${oId}`);
          if (!oRaw) continue;
          const ord = JSON.parse(oRaw);
          if (ord.email && ord.email.toLowerCase() === cleanEmail) {
            const hasItem = (ord.items || []).some((i) => i.productId === book.id);
            if (hasItem && (ord.status === 'paid' || ord.status === 'gift' || ord.paymentId)) {
              isVerifiedBuyer = true;
              break;
            }
          }
        }
      }
    } catch {}
  }

  const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const review = {
    id: reviewId,
    productId: book.id,
    bookName,
    name: cleanName,
    email: cleanEmail,
    rating: numRating,
    comment: cleanComment,
    verifiedBuyer: isVerifiedBuyer,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (env && env.TAMYIZ_STORE) {
    try {
      let pending = [];
      const raw = await env.TAMYIZ_STORE.get('store:reviews:pending');
      if (raw) pending = JSON.parse(raw);
      if (!Array.isArray(pending)) pending = [];
      pending.unshift(review);
      if (pending.length > 500) pending = pending.slice(0, 500);
      await env.TAMYIZ_STORE.put('store:reviews:pending', JSON.stringify(pending));
    } catch (err) {
      console.warn('Could not save pending review:', err.message);
    }
  }

  return json({
    ok: true,
    message: 'Thank you! Your reader review has been submitted for moderation.',
    reviewId,
  });
}

// ---------------------------------------------------------------------------
// Admin Review Operations
// ---------------------------------------------------------------------------

export async function getAdminReviews(env) {
  let pending = [];
  let approved = [];
  if (env && env.TAMYIZ_STORE) {
    try {
      const rawP = await env.TAMYIZ_STORE.get('store:reviews:pending');
      if (rawP) pending = JSON.parse(rawP);
      const rawA = await env.TAMYIZ_STORE.get('store:reviews:approved');
      if (rawA) approved = JSON.parse(rawA);
    } catch {}
  }
  return json({
    ok: true,
    pending: Array.isArray(pending) ? pending : [],
    approved: Array.isArray(approved) ? approved : [],
  });
}

export async function approveReview(env, reviewId) {
  if (!env || !env.TAMYIZ_STORE) return json({ ok: true });
  const kv = env.TAMYIZ_STORE;

  let pending = [];
  let approved = [];
  try {
    const rawP = await kv.get('store:reviews:pending');
    if (rawP) pending = JSON.parse(rawP);
    const rawA = await kv.get('store:reviews:approved');
    if (rawA) approved = JSON.parse(rawA);
  } catch {}
  if (!Array.isArray(pending)) pending = [];
  if (!Array.isArray(approved)) approved = [];

  const foundIdx = pending.findIndex((r) => r.id === reviewId);
  if (foundIdx !== -1) {
    const rev = pending.splice(foundIdx, 1)[0];
    rev.status = 'approved';
    rev.approvedAt = new Date().toISOString();
    approved.unshift(rev);

    await kv.put('store:reviews:pending', JSON.stringify(pending));
    await kv.put('store:reviews:approved', JSON.stringify(approved));
    return json({ ok: true, review: rev });
  }

  return json({ error: 'Review not found in pending list.' }, 404);
}

export async function deleteReview(env, reviewId) {
  if (!env || !env.TAMYIZ_STORE) return json({ ok: true });
  const kv = env.TAMYIZ_STORE;

  let pending = [];
  let approved = [];
  try {
    const rawP = await kv.get('store:reviews:pending');
    if (rawP) pending = JSON.parse(rawP);
    const rawA = await kv.get('store:reviews:approved');
    if (rawA) approved = JSON.parse(rawA);
  } catch {}
  if (!Array.isArray(pending)) pending = [];
  if (!Array.isArray(approved)) approved = [];

  const filteredP = pending.filter((r) => r.id !== reviewId);
  const filteredA = approved.filter((r) => r.id !== reviewId);

  await kv.put('store:reviews:pending', JSON.stringify(filteredP));
  await kv.put('store:reviews:approved', JSON.stringify(filteredA));
  return json({ ok: true });
}

