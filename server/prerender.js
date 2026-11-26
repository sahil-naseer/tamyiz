// Ready-made pages (26 Nov 2026): the first screen as plain HTML, so it paints before any script runs (Lighthouse's
// LCP on the live site depended on when Cloudflare's auto-injected analytics beacon reported; see CLAUDE.md).
// The HTML is the app's own drawing (prerenderPageHtml in tamyiz-unified-app.js); the browser keeps it.
import './ssr-env.js';
import { prerenderPageHtml } from '../src/scripts/tamyiz-unified-app.js';

const APP_OPEN = '<div id="app">';
const SCRIPT_MARK = '<!-- Unified TAMYIZ Script Entrypoint -->';
// The app asks for the e-book list itself just after a ready-made page has painted (see init()).
const PRODUCTS_PRELOAD = /\n?[ \t]*<link rel="preload" href="\/api\/products"[^>]*>/;

/**
 * shellFile: a built page file (dist/*.html) with the loading placeholder in #app.
 * Returns it with the page drawn in #app, <html class="mo pre"> and no early /api/products fetch.
 * page/slug/path/catalog: see prerenderPageHtml (catalog = publicCatalog(env), or null for "still loading").
 */
export function withReadyMadePage(shellFile, { page, slug = null, path, catalog = null }) {
  const start = shellFile.indexOf(APP_OPEN);
  const end = shellFile.lastIndexOf('</div>', shellFile.indexOf(SCRIPT_MARK));
  if (start < 0 || end < start) throw new Error('withReadyMadePage: #app placeholder not found');
  const html = shellFile.slice(0, start) + APP_OPEN + prerenderPageHtml({ page, slug, path, catalog }) + shellFile.slice(end);
  return html.replace(/<html lang="en">/, '<html lang="en" class="mo pre">').replace(PRODUCTS_PRELOAD, '');
}
