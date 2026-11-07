// /edition/<slug> on Cloudflare: the app page with that ebook's title, description and cover as the share preview.
// Ebooks live in KV (added on /admin), so these pages can't be prebuilt.
import { loadCatalog, findBySlug, publicProduct } from '../../server/catalog.js';
import { headTags, productMeta } from '../../src/data/seo.js';
import { withSecurityHeaders } from '../../server/security-headers.js';

const SEO_BLOCK = /<!-- seo:[\s\S]*?<!-- \/seo -->/;
const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

export async function onRequestGet({ request, env, params }) {
  const rec = findBySlug(await loadCatalog(env, { cached: true }), params.slug);
  if (!rec || rec.status === 'draft') {
    // Any unknown address returns the site's 404 page.
    const nf = await env.ASSETS.fetch(new URL('/__not-found__', request.url));
    return withSecurityHeaders(new Response(await nf.text(), { status: 404, headers: HTML }));
  }
  const shell = await (await env.ASSETS.fetch(new URL('/', request.url))).text();
  const pub = publicProduct(rec);
  // Start downloading the cover right away (it is the biggest thing on the page), instead of after the app's code runs.
  const cover = pub.images && pub.images[0] ? `\n  <link rel="preload" as="image" href="${pub.images[0]}" fetchpriority="high" />` : '';
  const html = shell.replace(SEO_BLOCK, `<!-- seo: per page -->\n${headTags(productMeta(pub))}${cover}\n  <!-- /seo -->`);
  return withSecurityHeaders(new Response(html, { headers: { ...HTML, 'Cache-Control': 'public, max-age=60' } }));
}
