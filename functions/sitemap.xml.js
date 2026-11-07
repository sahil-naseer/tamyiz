// /sitemap.xml: the fixed pages plus every ebook that is in the shop (from KV).
import { allPages, pageMeta, SITE_URL } from '../src/data/seo.js';
import { publicCatalog } from '../server/catalog.js';
import { withSecurityHeaders } from '../server/security-headers.js';

export async function onRequestGet({ env }) {
  const paths = allPages().map(({ page, slug }) => pageMeta(page, slug)).filter((m) => !m.noindex && m.path).map((m) => m.path);
  for (const p of await publicCatalog(env)) paths.push(`/edition/${p.slug}`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(paths)]
    .map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
  return withSecurityHeaders(new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } }));
}
