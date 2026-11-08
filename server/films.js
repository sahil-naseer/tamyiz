/**
 * TAMYIZ FILMS: Video Showcase Service
 *
 * Manages video metadata in Cloudflare KV under the key `showcase:videos`.
 * Supports YouTube (nocookie privacy mode), Vimeo, and direct HTTPS MP4 streams.
 * Videos link to products in the catalogue or stand alone as brand essays.
 */
import { json } from './payments.js';
import { loadCatalog } from './catalog.js';

const KEY = 'showcase:videos';
const MAX_TITLE = 140;
const MAX_DESC = 1200;
const MAX_CAT = 50;

export const DEFAULT_CATEGORIES = [
  'Book Trailers',
  'Motion Graphics',
  'Ideas & Concepts',
  'Educational Films',
  'Brand Stories',
];

/**
 * Validates and normalizes video URLs.
 * Extracts provider, canonical ID, embed URL, and default thumbnail URL.
 */
export function parseVideoSource(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Video URL is required.' };
  }
  const clean = rawUrl.trim();

  // Security check: Only http(s) protocols allowed (no javascript:, data:, file:)
  if (!/^https?:\/\//i.test(clean)) {
    return { valid: false, error: 'Only secure HTTP/HTTPS video URLs are supported.' };
  }

  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // 1. YouTube
    if (host === 'youtu.be') {
      const id = pathname.replace(/^\/+/, '').split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return {
          valid: true,
          provider: 'youtube',
          videoId: id,
          videoUrl: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
          defaultThumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        };
      }
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      let id = null;
      if (pathname === '/watch') {
        id = parsed.searchParams.get('v');
      } else if (pathname.startsWith('/embed/')) {
        id = pathname.replace(/^\/embed\//, '').split('/')[0];
      } else if (pathname.startsWith('/shorts/')) {
        id = pathname.replace(/^\/shorts\//, '').split('/')[0];
      }
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return {
          valid: true,
          provider: 'youtube',
          videoId: id,
          videoUrl: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
          defaultThumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        };
      }
      return { valid: false, error: 'Could not extract valid 11-character YouTube video ID.' };
    }

    // 2. Vimeo
    if (host.includes('vimeo.com')) {
      let id = null;
      if (host === 'player.vimeo.com' && pathname.startsWith('/video/')) {
        id = pathname.replace(/^\/video\//, '').split('/')[0];
      } else {
        const parts = pathname.split('/').filter(Boolean);
        id = parts[parts.length - 1];
      }
      if (id && /^[0-9]{6,12}$/.test(id)) {
        return {
          valid: true,
          provider: 'vimeo',
          videoId: id,
          videoUrl: `https://vimeo.com/${id}`,
          embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`,
          defaultThumbnail: '',
        };
      }
      return { valid: false, error: 'Could not extract numeric Vimeo video ID.' };
    }

    // 3. Direct MP4 stream (over HTTPS)
    if (parsed.protocol === 'https:' && pathname.toLowerCase().endsWith('.mp4')) {
      return {
        valid: true,
        provider: 'mp4',
        videoId: null,
        videoUrl: clean,
        embedUrl: clean,
        defaultThumbnail: '',
      };
    }

    return {
      valid: false,
      error: 'Unsupported video source. Please use a YouTube link, Vimeo link, or direct HTTPS MP4 URL.',
    };
  } catch {
    return { valid: false, error: 'Malformed video URL format.' };
  }
}

/** Generate a clean URL-friendly slug */
export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

/** Read video list from KV */
export async function loadVideos(env) {
  if (!env || !env.TAMYIZ_STORE || !env.TAMYIZ_STORE.get) return [];
  try {
    const raw = await env.TAMYIZ_STORE.get(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load showcase videos from KV:', err);
    return [];
  }
}

/** Save video list to KV */
export async function saveVideos(env, list) {
  if (!env || !env.TAMYIZ_STORE || !env.TAMYIZ_STORE.put) {
    throw new Error('Storage is not configured (TAMYIZ_STORE missing).');
  }
  await env.TAMYIZ_STORE.put(KEY, JSON.stringify(list));
}

/**
 * Public catalog view:
 * Returns published videos only, enriched with linked product info.
 */
export async function publicVideos(env) {
  const all = await loadVideos(env);
  const published = all.filter((v) => v.published);

  // Sort by displayOrder ascending, then createdAt descending
  published.sort((a, b) => {
    const orderDiff = (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  // Enrich with associated book details if available
  let catalogMap = new Map();
  try {
    const catalog = await loadCatalog(env);
    for (const p of catalog) {
      catalogMap.set(p.id, {
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        tagline: p.tagline,
        available: p.status === 'on-sale',
        coverThumb: `/api/cover/${p.id}?s=sm`,
      });
    }
  } catch {
    // If catalog load fails, continue with videos un-enriched
  }

  return published.map((v) => ({
    id: v.id,
    slug: v.slug,
    title: v.title,
    description: v.description,
    provider: v.provider,
    videoUrl: v.videoUrl,
    embedUrl: v.embedUrl,
    thumbnailUrl: v.thumbnailUrl || v.defaultThumbnail || '',
    category: v.category || 'General',
    duration: v.duration || '',
    featured: Boolean(v.featured),
    homepageVisible: Boolean(v.homepageVisible),
    productId: v.productId || null,
    book: v.productId ? (catalogMap.get(v.productId) || null) : null,
    createdAt: v.createdAt,
  }));
}

/** Public API: GET /api/films */
export async function handlePublicFilms(request, env) {
  const videos = await publicVideos(env);
  return json({ videos }, 200, { 'Cache-Control': 'public, max-age=60' });
}

/** Public API: GET /api/films/featured */
export async function handleFeaturedFilm(request, env) {
  const videos = await publicVideos(env);
  const featured = videos.find((v) => v.featured) || videos[0] || null;
  return json({ video: featured });
}

/** Public API: GET /api/films/:slugOrId */
export async function handleSingleFilm(request, env, slugOrId) {
  const videos = await publicVideos(env);
  const target = slugOrId.toLowerCase();
  const video = videos.find((v) => v.slug === target || v.id.toLowerCase() === target);
  if (!video) return json({ error: 'Film not found.' }, 404);
  return json({ video });
}

/** Admin API: GET /api/admin/films */
export async function handleAdminGetFilms(request, env) {
  const videos = await loadVideos(env);
  let catalogMap = new Map();
  try {
    const catalog = await loadCatalog(env);
    for (const p of catalog) {
      catalogMap.set(p.id, { id: p.id, name: p.name, slug: p.slug });
    }
  } catch {}

  const enriched = videos.map((v) => ({
    ...v,
    bookName: v.productId ? (catalogMap.get(v.productId)?.name || 'Linked book unavailable') : null,
  }));

  return json({ ok: true, videos: enriched });
}

/** Admin API: POST /api/admin/films (Create or Update) */
export async function handleAdminSaveFilm(request, env, filmId = null) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }

  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'Title is required.' }, 400);
  if (title.length > MAX_TITLE) {
    return json({ error: `Title must be ${MAX_TITLE} characters or fewer.` }, 400);
  }

  const rawUrl = String(body.videoUrl || '').trim();
  const parsedSource = parseVideoSource(rawUrl);
  if (!parsedSource.valid) {
    return json({ error: parsedSource.error }, 400);
  }

  const description = String(body.description || '').trim().slice(0, MAX_DESC);
  const category = String(body.category || 'General').trim().slice(0, MAX_CAT) || 'General';
  const customThumb = String(body.thumbnailUrl || '').trim();
  if (customThumb && !/^https?:\/\//i.test(customThumb)) {
    return json({ error: 'Thumbnail URL must be a valid HTTP or HTTPS address.' }, 400);
  }

  const duration = String(body.duration || '').trim().slice(0, 20);
  const productId = body.productId ? String(body.productId).trim() : null;

  // Verify associated product exists if specified
  if (productId) {
    try {
      const catalog = await loadCatalog(env);
      const exists = catalog.some((p) => p.id === productId);
      if (!exists) {
        return json({ error: `Selected book ID "${productId}" not found in catalogue.` }, 400);
      }
    } catch {
      // Continue if catalog lookup has transient failure
    }
  }

  const videos = await loadVideos(env);
  const now = new Date().toISOString();
  let film = null;

  if (filmId) {
    // Edit existing
    const idx = videos.findIndex((v) => v.id === filmId);
    if (idx === -1) return json({ error: 'Film not found.' }, 404);

    const existing = videos[idx];
    const newSlug = body.slug ? slugify(body.slug) : (existing.slug || slugify(title));

    film = {
      ...existing,
      title,
      slug: newSlug || existing.id,
      description,
      videoUrl: parsedSource.videoUrl,
      provider: parsedSource.provider,
      videoId: parsedSource.videoId,
      embedUrl: parsedSource.embedUrl,
      defaultThumbnail: parsedSource.defaultThumbnail,
      thumbnailUrl: customThumb || parsedSource.defaultThumbnail || '',
      category,
      duration,
      productId: productId || null,
      featured: Boolean(body.featured),
      homepageVisible: body.homepageVisible !== undefined ? Boolean(body.homepageVisible) : true,
      published: Boolean(body.published),
      displayOrder: Number(body.displayOrder) || existing.displayOrder || 0,
      updatedAt: now,
    };
    videos[idx] = film;
  } else {
    // Create new
    const id = `film-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let baseSlug = slugify(title) || id;
    let slug = baseSlug;
    let count = 1;
    while (videos.some((v) => v.slug === slug)) {
      slug = `${baseSlug}-${++count}`;
    }

    film = {
      id,
      slug,
      title,
      description,
      videoUrl: parsedSource.videoUrl,
      provider: parsedSource.provider,
      videoId: parsedSource.videoId,
      embedUrl: parsedSource.embedUrl,
      defaultThumbnail: parsedSource.defaultThumbnail,
      thumbnailUrl: customThumb || parsedSource.defaultThumbnail || '',
      category,
      duration,
      productId: productId || null,
      featured: Boolean(body.featured),
      homepageVisible: body.homepageVisible !== undefined ? Boolean(body.homepageVisible) : true,
      published: Boolean(body.published),
      displayOrder: Number(body.displayOrder) || videos.length + 1,
      createdAt: now,
      updatedAt: now,
    };
    videos.unshift(film);
  }

  // If this film is marked as featured, optionally make it the unique featured one
  if (film.featured) {
    for (const v of videos) {
      if (v.id !== film.id && v.featured) v.featured = false;
    }
  }

  await saveVideos(env, videos);
  return json({ ok: true, film });
}

/** Admin API: DELETE /api/admin/films/:id */
export async function handleAdminDeleteFilm(env, filmId) {
  const videos = await loadVideos(env);
  const filtered = videos.filter((v) => v.id !== filmId);
  if (filtered.length === videos.length) {
    return json({ error: 'Film not found.' }, 404);
  }
  await saveVideos(env, filtered);
  return json({ ok: true, message: 'Film removed from collection.' });
}

/** Admin API: POST /api/admin/films/reorder */
export async function handleAdminReorderFilms(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }
  const orderedIds = body.ids;
  if (!Array.isArray(orderedIds)) {
    return json({ error: 'Field "ids" must be an array of film IDs.' }, 400);
  }

  const videos = await loadVideos(env);
  const idMap = new Map(videos.map((v) => [v.id, v]));

  const reordered = [];
  orderedIds.forEach((id, index) => {
    const found = idMap.get(id);
    if (found) {
      found.displayOrder = index + 1;
      reordered.push(found);
      idMap.delete(id);
    }
  });

  // Append any videos that were not in the reorder payload
  for (const remaining of idMap.values()) {
    remaining.displayOrder = reordered.length + 1;
    reordered.push(remaining);
  }

  await saveVideos(env, reordered);
  return json({ ok: true, count: reordered.length });
}

