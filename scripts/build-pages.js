// Runs after `vite build`. Writes one HTML file per fixed page (same app, page-specific <head>) and a 404 page.
// Ebook pages (/edition/<slug>) are made live on Cloudflare by functions/edition/[slug].js.
// Cloudflare Pages serves dist/editions.html at /editions and dist/404.html (status 404) for any unknown address.
import fs from 'node:fs';
import path from 'node:path';
import { allPages, headTags, pageMeta, SITE_URL } from '../src/data/seo.js';

const dist = path.resolve('dist');
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const SEO_BLOCK = /<!-- seo:[\s\S]*?<!-- \/seo -->/;
if (!SEO_BLOCK.test(template)) throw new Error('index.html is missing the <!-- seo --> ... <!-- /seo --> block');

// The markers stay in the output: functions/edition/[slug].js swaps them for a product's tags on Cloudflare.
const render = (meta) => template.replace(SEO_BLOCK, `<!-- seo: per page -->\n${headTags(meta)}\n  <!-- /seo -->`);
const fileFor = (urlPath) => (urlPath === '/' ? 'index.html' : urlPath.slice(1) + '.html');

// Home asks for the e-book list only after its first screen has painted (tamyiz-unified-app.js, init), so its file
// drops the early fetch of /api/products: Lighthouse otherwise sometimes made the first paint wait for that download.
// functions/edition/[slug].js uses this same file as its shell and adds the preload back for book pages.
const PRODUCTS_PRELOAD = /\n?[ \t]*<link rel="preload" href="\/api\/products"[^>]*>/;
if (!PRODUCTS_PRELOAD.test(template)) throw new Error('index.html is missing the /api/products preload');
const forFile = (file, html) => (path.basename(file) === 'index.html' && path.dirname(file) === dist ? html.replace(PRODUCTS_PRELOAD, '') : html);

const written = [];
for (const { page, slug } of allPages()) {
  const meta = pageMeta(page, slug);
  const file = path.join(dist, fileFor(meta.path));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, forFile(file, render(meta)));
  written.push(meta);
}
// /legal on its own opens the first policy.
fs.writeFileSync(path.join(dist, 'legal.html'), render(pageMeta('legal', 'delivery-protocol')));
fs.writeFileSync(path.join(dist, '404.html'), render(pageMeta('notfound')));

// sitemap.xml is made live by functions/sitemap.xml.js (it includes the ebooks added on /admin).
console.log(`build-pages: ${written.length} pages + legal.html + 404.html`);
