/**
 * TAMYIZ™ catalogue: the ebooks you add on /admin, kept in Cloudflare KV (binding `TAMYIZ_STORE`).
 *
 * KV keys
 *   products        JSON list of every ebook record (one key, so the shop needs one read per visit)
 *   cover:<id>      cover image bytes  (metadata: { type })
 *   thumb:<id>      small cover for cards and the bag, made in the browser on /admin (metadata: { type })
 *   file:<id>       the PDF bytes      (metadata: { type, name, size })
 *
 * Status of an ebook
 *   draft    only visible on /admin
 *   soon     in the shop as "Coming soon" (WhatsApp pre-order)
 *   on-sale  can be bought; needs a PDF. The payment server only sells "on-sale" ebooks.
 */

import { parseVideoSource } from './films.js';

export const STATUSES = ['draft', 'soon', 'on-sale'];
export const MAX_PDF_BYTES = 25 * 1024 * 1024; // Cloudflare KV limit per value (25 MiB)
export const MAX_COVER_BYTES = 2 * 1024 * 1024;

const KEY_LIST = 'products';

export function store(env) {
  const kv = env && env.TAMYIZ_STORE;
  if (!kv) throw new StoreMissing();
  return kv;
}

export class StoreMissing extends Error {
  constructor() {
    super('Storage is not connected yet. In Cloudflare: Pages project → Settings → Bindings → add KV namespace "TAMYIZ_STORE".');
    this.status = 503;
  }
}

/**
 * Every ebook record (newest first). No storage connected = an empty shop.
 * `cached: true` (shop pages only) lets Cloudflare keep the list at the visitor's nearest data centre for 5 minutes.
 * Without it, a quiet site pays a slow first read from central storage on almost every visit (seen: 6.5 s, 27 Oct 2026).
 * Admin and payments never use the cached copy, so a save or a price is never based on an old list.
 */
export const CATALOG_CACHE_SECONDS = 300;
export async function loadCatalog(env, { cached = false } = {}) {
  if (!env || !env.TAMYIZ_STORE) return [];
  const list = await env.TAMYIZ_STORE.get(KEY_LIST, cached ? { type: 'json', cacheTtl: CATALOG_CACHE_SECONDS } : 'json');
  return Array.isArray(list) ? list : [];
}

export async function saveCatalog(env, list) {
  await store(env).put(KEY_LIST, JSON.stringify(list));
}

export const findById = (list, id) => list.find((p) => p.id === id);
export const findBySlug = (list, slug) => list.find((p) => p.slug === String(slug || '').toLowerCase());

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** What the shop (and anyone) may see: no drafts, no file keys. Text is HTML-escaped (the shop draws with innerHTML). */
export function publicProduct(p, filmsList = null) {
  const cover = p.coverType ? `/api/cover/${p.id}?v=${p.updatedAt}` : '/og/tamyiz.jpg';
  // Cards and the bag use the small version when it exists (about a quarter of the bytes); the product page uses the full cover.
  const thumb = p.thumbType ? `/api/cover/${p.id}?s=sm&v=${p.thumbAt || p.updatedAt}` : cover;
  const specs = [{ label: 'Format', value: 'PDF e-book, instant download after payment' }];
  if (p.pages) specs.push({ label: 'Pages', value: `${p.pages}` });
  specs.push({ label: 'Reads on', value: 'Phone, tablet, laptop, Kindle (send-to-Kindle), Apple Books' });

  // Associated preview/trailer video
  let video = null;
  if (p.videoUrl) {
    const parsed = parseVideoSource(p.videoUrl);
    if (parsed.valid) {
      video = {
        title: `${esc(p.name)} — Preview`,
        videoUrl: parsed.videoUrl,
        provider: parsed.provider,
        videoId: parsed.videoId,
        embedUrl: parsed.embedUrl,
        thumbnailUrl: parsed.defaultThumbnail || '',
      };
    }
  }
  if (!video && filmsList && Array.isArray(filmsList)) {
    const match = filmsList.find((f) => f.productId === p.id && f.published);
    if (match) {
      video = {
        title: esc(match.title),
        videoUrl: match.videoUrl,
        provider: match.provider,
        videoId: match.videoId,
        embedUrl: match.embedUrl,
        thumbnailUrl: match.thumbnailUrl || match.defaultThumbnail || '',
        duration: match.duration || '',
      };
    }
  }

  // Sample excerpt for the lead-capture sample reader
  let sampleExcerpt = null;
  if (p.sampleExcerpt) {
    if (typeof p.sampleExcerpt === 'object') {
      sampleExcerpt = {
        chapter: esc(p.sampleExcerpt.chapter || 'Chapter 01'),
        subtitle: esc(p.sampleExcerpt.subtitle || 'Foundations & Architecture'),
        text: esc(p.sampleExcerpt.text || ''),
      };
    } else if (typeof p.sampleExcerpt === 'string' && p.sampleExcerpt.trim()) {
      sampleExcerpt = {
        chapter: 'Chapter 01',
        subtitle: esc(p.tagline || 'Essential Principles'),
        text: esc(p.sampleExcerpt),
      };
    }
  } else if (p.description) {
    sampleExcerpt = {
      chapter: 'Chapter 01 (Preview)',
      subtitle: esc(p.tagline || 'Essential Principles'),
      text: esc(p.description),
    };
  }

  return {
    id: p.id,
    slug: p.slug,
    name: esc(p.name),
    tagline: esc(p.tagline || ''),
    description: esc(p.description || ''),
    category: 'E-Books',
    categoryCode: 'ebooks',
    price: p.price,
    badge: 'E-BOOK',
    isDigital: true,
    available: p.status === 'on-sale',
    status: p.status,
    images: [cover],
    thumb,
    video,
    tableOfContents: Array.isArray(p.contents) ? p.contents.map(esc) : [],
    sampleExcerpt,
    specifications: specs,
    fileSpecs: `PDF e-book${p.pages ? ` • ${p.pages} pages` : ''} • Instant download`,
    highlights: [],
    relatedIds: [],
    updatedAt: p.updatedAt,
  };
}

export async function publicCatalog(env) {
  let films = [];
  if (env && env.TAMYIZ_STORE && env.TAMYIZ_STORE.get) {
    try {
      const raw = await env.TAMYIZ_STORE.get('showcase:videos');
      if (raw) films = JSON.parse(raw);
    } catch {}
  }
  return (await loadCatalog(env, { cached: true })).filter((p) => p.status !== 'draft').map((p) => publicProduct(p, films));
}

// ---------------------------------------------------------------------------
// Validation of what /admin sends
// ---------------------------------------------------------------------------

const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ebook';
}

/** Turns form fields into a clean record update. Throws an Error with a plain-English message. */
export function readFields(form) {
  const name = clean(form.get('name'), 140);
  if (name.length < 3) throw new Error('Give the ebook a title (at least 3 characters).');
  const price = Number(clean(form.get('price'), 10));
  if (!Number.isInteger(price) || price < 1 || price > 100000) throw new Error('Price must be a whole number of rupees between 1 and 1,00,000.');
  const pagesRaw = clean(form.get('pages'), 6);
  const pages = pagesRaw ? Number(pagesRaw) : null;
  if (pagesRaw && (!Number.isInteger(pages) || pages < 1 || pages > 5000)) throw new Error('Pages must be a whole number (or leave it empty).');
  const status = clean(form.get('status'), 10) || 'draft';
  if (!STATUSES.includes(status)) throw new Error('Unknown status.');
  const contents = clean(form.get('contents'), 4000).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 40);

  const rawVideo = clean(form.get('videoUrl') || form.get('video'), 500);
  let videoUrl = null;
  if (rawVideo) {
    const parsed = parseVideoSource(rawVideo);
    if (!parsed.valid) throw new Error(parsed.error);
    videoUrl = parsed.videoUrl;
  }

  const fields = {
    name,
    tagline: clean(form.get('tagline'), 200),
    description: clean(form.get('description'), 5000),
    price,
    pages,
    contents,
    status,
    videoUrl,
  };
  const hasSampleField = form.has('sampleExcerpt') || form.has('sample');
  if (hasSampleField) {
    const sampleText = clean(form.get('sampleExcerpt') || form.get('sample') || '', 10000);
    fields.sampleExcerpt = sampleText ? {
      chapter: clean(form.get('sampleChapter') || 'Chapter 01', 100),
      subtitle: clean(form.get('sampleSubtitle') || form.get('tagline') || 'Introduction', 150),
      text: sampleText,
    } : null;
  }
  return fields;
}

/** Real file type from the first bytes (never trust the file name or the browser's claim). */
export function sniff(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function newId() {
  const r = crypto.getRandomValues(new Uint8Array(4));
  return 'eb-' + [...r].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** A slug nobody else uses (adds -2, -3 ... if needed). */
export function uniqueSlug(list, wanted, ownId) {
  const base = slugify(wanted);
  let slug = base;
  for (let n = 2; list.some((p) => p.slug === slug && p.id !== ownId); n++) slug = `${base}-${n}`;
  return slug;
}
