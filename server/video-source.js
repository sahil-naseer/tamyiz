/**
 * Book preview videos (the optional "Book Preview / Trailer Video" on /admin): checks a pasted link and turns it
 * into something the video pop-up can play. YouTube (privacy mode), Vimeo, or a direct HTTPS MP4.
 * (Moved here from films.js on 25 Nov 2026, when the Films section was removed.)
 */

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
