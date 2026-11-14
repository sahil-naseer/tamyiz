/**
 * Every /api/* address in one place. Cloudflare runs it through functions/api/[[path]].js;
 * the local Vite server runs it through vite.config.js, so both behave the same.
 */
import { json, handleCreateOrder, handleVerifyPayment, handleDownload, handleRazorpayWebhook, findCoupon } from './payments.js';

const COUPON_RATE_WINDOW_MS = 5 * 60 * 1000;
const COUPON_RATE_MAX = 30;
const couponRateBuckets = new WeakMap();
const fallbackCouponMap = new Map();
function allowCouponLookup(env, ip) {
  const storeRef = env && typeof env.TAMYIZ_STORE === 'object' && env.TAMYIZ_STORE !== null ? env.TAMYIZ_STORE : null;
  let map = fallbackCouponMap;
  if (storeRef) {
    if (!couponRateBuckets.has(storeRef)) couponRateBuckets.set(storeRef, new Map());
    map = couponRateBuckets.get(storeRef);
  }
  const now = Date.now();
  const rec = map.get(ip);
  if (!rec || now > rec.expiresAt) {
    if (map.size > 512) map.clear();
    map.set(ip, { count: 1, expiresAt: now + COUPON_RATE_WINDOW_MS });
    return true;
  }
  if (rec.count >= COUPON_RATE_MAX) return false;
  rec.count += 1;
  return true;
}
import { handleAdmin } from './admin.js';
import { publicCatalog } from './catalog.js';
import { handleSampleLead } from './sample.js';
import { handleRecoverDownloads } from './recovery.js';
import { handleReviews } from './reviews.js';
import { handleTrackAbandonedCart } from './abandoned.js';
import { handlePublicFilms, handleFeaturedFilm, handleSingleFilm } from './films.js';

async function cover(env, id, request) {
  if (!env.TAMYIZ_STORE) return new Response('Not found', { status: 404 });
  const params = new URL(request.url).searchParams;
  // ?s=sm asks for the small version (cards, bag); fall back to the full cover if a book has none yet.
  let found = params.get('s') === 'sm' ? await env.TAMYIZ_STORE.getWithMetadata(`thumb:${id}`, 'arrayBuffer') : null;
  if (!found || !found.value) found = await env.TAMYIZ_STORE.getWithMetadata(`cover:${id}`, 'arrayBuffer');
  if (!found || !found.value) return new Response('Not found', { status: 404 });
  const { value, metadata } = found;
  const versioned = params.has('v');
  return new Response(value, {
    headers: {
      'Content-Type': (metadata && metadata.type) || 'image/jpeg',
      // Each upload gets a new ?v=, so a versioned address can be cached for a long time.
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function route(request, env, fetchImpl = fetch) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const method = request.method;
  const rest = path.replace(/^\/api\/?/, '');

  if (rest.startsWith('admin/')) return handleAdmin(request, env, rest.slice(6), fetchImpl);

  if (rest === 'products' && method === 'GET') {
    const products = await publicCatalog(env);
    return new Response(JSON.stringify({ products }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate', // newly added e-books show immediately
      },
    });
  }

  if (rest === 'announcement' && method === 'GET') {
    let announcement = null;
    if (env.TAMYIZ_STORE && env.TAMYIZ_STORE.get) {
      try {
        const raw = await env.TAMYIZ_STORE.get('store:announcement');
        announcement = raw ? JSON.parse(raw) : null;
      } catch {}
    }
    return json({ announcement });
  }
  // Is a coupon code valid? (uses in-memory limiter so coupon scans never burn Cloudflare KV daily write quota)
  if (rest === 'coupon' && method === 'GET') {
    const rawCode = String(new URL(request.url).searchParams.get('code') || '').trim();
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(rawCode)) return json({ valid: false }, 404);
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    if (!allowCouponLookup(env, ip)) {
      return json({ valid: false, error: 'Too many coupon attempts. Please wait a few minutes.' }, 429);
    }
    const c = await findCoupon(env, rawCode);
    return c ? json({ valid: true, coupon: c }) : json({ valid: false }, 404);
  }

  let m = rest.match(/^cover\/([a-z0-9-]{3,40})$/);
  if (m && method === 'GET') return cover(env, m[1], request);
  m = rest.match(/^download\/([a-z0-9-]{3,40})$/);
  if (m && method === 'GET') return handleDownload(request, env, m[1]);

  if (rest === 'sample' && method === 'POST') {
    return handleSampleLead(request, env);
  }

  if (rest === 'recover-downloads' && method === 'POST') {
    return handleRecoverDownloads(request, env, fetchImpl);
  }

  if (rest === 'reviews') {
    return handleReviews(request, env);
  }

  if (rest === 'abandoned-cart' && method === 'POST') {
    return handleTrackAbandonedCart(request, env);
  }

  if (rest === 'films' && method === 'GET') {
    return handlePublicFilms(request, env);
  }
  if (rest === 'films/featured' && method === 'GET') {
    return handleFeaturedFilm(request, env);
  }
  if (rest.startsWith('films/') && method === 'GET') {
    return handleSingleFilm(request, env, rest.slice(6));
  }

  if (rest === 'create-order' || rest === 'verify-payment' || rest === 'webhook/razorpay' || rest === 'razorpay-webhook') {
    if (method !== 'POST') return json({ error: 'Method Not Allowed. Use POST.' }, 405);
    if (rest === 'create-order') return handleCreateOrder(request, env, fetchImpl);
    if (rest === 'verify-payment') return handleVerifyPayment(request, env, fetchImpl);
    return handleRazorpayWebhook(request, env, fetchImpl);
  }
  return json({ error: 'Not found.' }, 404);
}
