// Book preview video links (YouTube, Vimeo, MP4). Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoSource } from '../server/video-source.js';

test('book videos: parseVideoSource accurately extracts YouTube, Vimeo, and MP4 sources', () => {
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
