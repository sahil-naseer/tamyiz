/**
 * Every /api/* address in one place. Cloudflare runs it through functions/api/[[path]].js;
 * the local Vite server runs it through vite.config.js, so both behave the same.
 */
import { json, handleCreateOrder, handleVerifyPayment, handleDownload, handleRazorpayWebhook, findCoupon } from './payments.js';
import { handleAdmin } from './admin.js';
import { publicCatalog } from './catalog.js';
import { handleSampleLead } from './sample.js';
import { handleRecoverDownloads } from './recovery.js';
import { handleReviews } from './reviews.js';
import { handleTrackAbandonedCart } from './abandoned.js';

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

  if (rest.startsWith('admin/')) return handleAdmin(request, env, rest.slice(6));

  if (rest === 'products' && method === 'GET') {
    const products = await publicCatalog(env);
    return new Response(JSON.stringify({ products }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, // new e-books show on the next page load
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
  // Is a coupon code valid? (the bag asks before showing a discount; the server re-checks at payment anyway)
  if (rest === 'coupon' && method === 'GET') {
    const c = await findCoupon(env, new URL(request.url).searchParams.get('code'));
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

  if (rest === 'create-order' || rest === 'verify-payment' || rest === 'webhook/razorpay' || rest === 'razorpay-webhook') {
    if (method !== 'POST') return json({ error: 'Method Not Allowed. Use POST.' }, 405);
    if (rest === 'create-order') return handleCreateOrder(request, env, fetchImpl);
    if (rest === 'verify-payment') return handleVerifyPayment(request, env, fetchImpl);
    return handleRazorpayWebhook(request, env, fetchImpl);
  }
  return json({ error: 'Not found.' }, 404);
}
