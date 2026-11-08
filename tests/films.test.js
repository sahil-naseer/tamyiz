// TAMYIZ FILMS: Video showcase tests. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../server/router.js';
import { devKV } from '../server/dev-kv.js';
import { parseVideoSource } from '../server/films.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 'https://shop.test';
const env = (extra = {}) => ({ TAMYIZ_STORE: devKV(), ADMIN_PASSWORD: PASSWORD, ...extra });
const call = (e, path, opts = {}) => route(new Request(BASE + path, opts), e);

async function session(e) {
  const r = await call(e, '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  return r.headers.get('Set-Cookie').split(';')[0];
}

const authed = (cookie, extra = {}) => ({ Cookie: cookie, 'X-Tamyiz-Admin': '1', 'Content-Type': 'application/json', ...extra });

test('films: parseVideoSource accurately extracts YouTube, Vimeo, and MP4 sources', () => {
  // YouTube standard
  const yt1 = parseVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt1.valid, true);
  assert.equal(yt1.provider, 'youtube');
  assert.equal(yt1.videoId, 'dQw4w9WgXcQ');
  assert.equal(yt1.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1');
  assert.equal(yt1.defaultThumbnail, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

  // YouTube short url
  const yt2 = parseVideoSource('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(yt2.valid, true);
  assert.equal(yt2.provider, 'youtube');
  assert.equal(yt2.videoId, 'dQw4w9WgXcQ');

  // YouTube embed url
  const yt3 = parseVideoSource('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(yt3.valid, true);
  assert.equal(yt3.videoId, 'dQw4w9WgXcQ');

  // Vimeo standard
  const vim1 = parseVideoSource('https://vimeo.com/76979871');
  assert.equal(vim1.valid, true);
  assert.equal(vim1.provider, 'vimeo');
  assert.equal(vim1.videoId, '76979871');
  assert.equal(vim1.embedUrl, 'https://player.vimeo.com/video/76979871?autoplay=1&dnt=1');

  // Vimeo player url
  const vim2 = parseVideoSource('https://player.vimeo.com/video/76979871');
  assert.equal(vim2.valid, true);
  assert.equal(vim2.videoId, '76979871');

  // Direct MP4
  const mp4 = parseVideoSource('https://cdn.example.com/trailers/tamyiz-trailer.mp4');
  assert.equal(mp4.valid, true);
  assert.equal(mp4.provider, 'mp4');

  // Invalid / Dangerous sources
  assert.equal(parseVideoSource('javascript:alert(1)').valid, false);
  assert.equal(parseVideoSource('http://insecure.test/trailer.mp4').valid, false);
  assert.equal(parseVideoSource('https://unknown-platform.com/video/123').valid, false);
  assert.equal(parseVideoSource('').valid, false);
});

test('films: public endpoint returns published films only and ignores drafts', async () => {
  const e = env();
  const cookie = await session(e);

  // Add draft film
  await call(e, '/api/admin/films', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({
      title: 'Secret Concept Trailer',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      category: 'Ideas & Concepts',
      published: false,
    }),
  });

  // Add published film
  await call(e, '/api/admin/films', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({
      title: 'The Architecture of Distinction Trailer',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      category: 'Book Trailers',
      duration: '02:15',
      featured: true,
      published: true,
      homepageVisible: true,
    }),
  });

  // Query public endpoint
  const res = await call(e, '/api/films');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(Array.isArray(data.videos), true);
  assert.equal(data.videos.length, 1);
  assert.equal(data.videos[0].title, 'The Architecture of Distinction Trailer');
  assert.equal(data.videos[0].category, 'Book Trailers');
  assert.equal(data.videos[0].featured, true);

  // Query featured endpoint
  const featRes = await call(e, '/api/films/featured');
  assert.equal(featRes.status, 200);
  const featData = await featRes.json();
  assert.equal(featData.video.title, 'The Architecture of Distinction Trailer');

  // Query single film by slug
  const slug = data.videos[0].slug;
  const singleRes = await call(e, `/api/films/${slug}`);
  assert.equal(singleRes.status, 200);
  const singleData = await singleRes.json();
  assert.equal(singleData.video.title, 'The Architecture of Distinction Trailer');
});

test('films: admin CRUD, toggle publish, and deletion work securely', async () => {
  const e = env();
  const cookie = await session(e);

  // Unauthorized requests without admin session are rejected
  const unauth = await call(e, '/api/admin/films');
  assert.equal(unauth.status, 401);

  // Without X-Tamyiz-Admin header rejected with 403
  const noHeader = await call(e, '/api/admin/films', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test' }),
  });
  assert.equal(noHeader.status, 403);

  // Validation: Missing title or invalid URL
  const badReq = await call(e, '/api/admin/films', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({ title: '', videoUrl: 'not a url' }),
  });
  assert.equal(badReq.status, 400);

  // Create film
  const createRes = await call(e, '/api/admin/films', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({
      title: 'TAMYIZ Motion Graphics',
      videoUrl: 'https://vimeo.com/76979871',
      category: 'Motion Graphics',
      duration: '01:30',
      published: true,
      displayOrder: 5,
    }),
  });
  assert.equal(createRes.status, 200);
  const created = (await createRes.json()).film;
  assert.equal(created.title, 'TAMYIZ Motion Graphics');
  assert.equal(created.provider, 'vimeo');
  assert.equal(created.videoId, '76979871');

  // Edit film
  const editRes = await call(e, `/api/admin/films/${created.id}`, {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({
      ...created,
      title: 'TAMYIZ Motion Graphics (Updated)',
      published: false,
    }),
  });
  assert.equal(editRes.status, 200);
  const edited = (await editRes.json()).film;
  assert.equal(edited.title, 'TAMYIZ Motion Graphics (Updated)');
  assert.equal(edited.published, false);

  // Admin GET films lists all videos (including drafts)
  const listRes = await call(e, '/api/admin/films', { headers: authed(cookie) });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.videos.length, 1);

  // Delete film
  const delRes = await call(e, `/api/admin/films/${created.id}`, {
    method: 'DELETE',
    headers: authed(cookie),
  });
  assert.equal(delRes.status, 200);

  // Check empty
  const afterDel = await call(e, '/api/admin/films', { headers: authed(cookie) });
  assert.equal((await afterDel.json()).videos.length, 0);
});

test('films: reorder endpoint updates sequence of videos', async () => {
  const e = env();
  const cookie = await session(e);

  const f1 = await (await call(e, '/api/admin/films', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({ title: 'Film 1', videoUrl: 'https://vimeo.com/111111', published: true }),
  })).json();

  const f2 = await (await call(e, '/api/admin/films', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({ title: 'Film 2', videoUrl: 'https://vimeo.com/222222', published: true }),
  })).json();

  // Reorder so Film 2 is first, Film 1 is second
  const reorderRes = await call(e, '/api/admin/films/reorder', {
    method: 'POST',
    headers: authed(cookie),
    body: JSON.stringify({ ids: [f2.film.id, f1.film.id] }),
  });
  assert.equal(reorderRes.status, 200);

  const pubRes = await call(e, '/api/films');
  const pubVideos = (await pubRes.json()).videos;
  assert.equal(pubVideos[0].title, 'Film 2');
  assert.equal(pubVideos[1].title, 'Film 1');
});

