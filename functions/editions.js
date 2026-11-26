// /editions on Cloudflare: the shop page drawn here from the live catalogue as ready-made HTML (26 Nov 2026,
// server/prerender.js), so it paints before any script. Built from dist/editions.html (its <head> comes from seo.js).
import { loadCatalog, publicProduct } from '../server/catalog.js';
import { withSecurityHeaders } from '../server/security-headers.js';
import { withReadyMadePage } from '../server/prerender.js';

const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

export async function onRequestGet({ request, env }) {
  const shell = await (await env.ASSETS.fetch(new URL('/editions', request.url))).text();
  let html = shell;
  try {
    const catalog = (await loadCatalog(env, { cached: true })).filter((p) => p.status !== 'draft').map((p) => publicProduct(p));
    html = withReadyMadePage(shell, { page: 'editions', path: '/editions', catalog });
    // The first card's cover is the biggest thing on the first screen: start it with the page.
    const first = html.match(/<img src="([^"]+)"(?: srcset="([^"]+)" sizes="([^"]+)")? alt="[^"]*" class="tamyiz-img-primary"/);
    const set = first && first[2] ? ` imagesrcset="${first[2]}" imagesizes="${first[3]}"` : '';
    if (first) html = html.replace('<!-- /seo -->', `<link rel="preload" as="image" href="${first[1]}"${set} fetchpriority="high" />\n  <!-- /seo -->`);
  } catch (err) {
    console.error('/editions: ready-made HTML failed, sending the plain page', err); // the app draws it as before
  }
  return withSecurityHeaders(new Response(html, { headers: { ...HTML, 'Cache-Control': 'public, max-age=60' } }));
}
