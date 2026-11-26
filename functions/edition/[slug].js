// /edition/<slug> on Cloudflare: the book's page, drawn here from the live catalogue as ready-made HTML (26 Nov 2026,
// server/prerender.js) so it paints before any script, with that ebook's title, description and cover as the share
// preview. Ebooks live in KV (added on /admin), so these pages can't be prebuilt.
import { loadCatalog, findBySlug, publicProduct } from '../../server/catalog.js';
import { headTags, productMeta } from '../../src/data/seo.js';
import { withSecurityHeaders } from '../../server/security-headers.js';
import { withReadyMadePage } from '../../server/prerender.js';

const SEO_BLOCK = /<!-- seo:[\s\S]*?<!-- \/seo -->/;
const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

export async function onRequestGet({ request, env, params }) {
  const catalogue = await loadCatalog(env, { cached: true });
  const rec = findBySlug(catalogue, params.slug);
  if (!rec || rec.status === 'draft') {
    // Any unknown address returns the site's 404 page.
    const nf = await env.ASSETS.fetch(new URL('/__not-found__', request.url));
    return withSecurityHeaders(new Response(await nf.text(), { status: 404, headers: HTML }));
  }
  // Shell: /editions (home's file holds home's ready-made page).
  const shell = await (await env.ASSETS.fetch(new URL('/editions', request.url))).text();
  const pub = publicProduct(rec);
  // Start downloading the cover right away (it is the biggest thing on the page).
  // Same choice as the page's <img srcset>: the 480px version on phones and tablets (product-detail-page.js).
  const set = pub.thumb && pub.images && pub.thumb !== pub.images[0]
    ? ` imagesrcset="${pub.thumb} 480w, ${pub.images[0]} 800w" imagesizes="(max-width: 1023px) 240px, 480px"` : '';
  const cover = pub.images && pub.images[0] ? `\n  <link rel="preload" as="image" href="${pub.images[0]}"${set} fetchpriority="high" />` : '';
  let html = shell.replace(SEO_BLOCK, `<!-- seo: per page -->\n${headTags(productMeta(pub))}${cover}\n  <!-- /seo -->`);
  try {
    const catalog = catalogue.filter((p) => p.status !== 'draft').map((p) => publicProduct(p)); // = /api/products
    html = withReadyMadePage(html, { page: 'edition', slug: params.slug, path: new URL(request.url).pathname, catalog });
  } catch (err) {
    console.error('book page: ready-made HTML failed, sending the plain page', err); // the app draws it as before
  }
  return withSecurityHeaders(new Response(html, { headers: { ...HTML, 'Cache-Control': 'public, max-age=60' } }));
}
