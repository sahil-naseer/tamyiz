/**
 * TAMYIZ FILMS: Video Modal Player
 *
 * Cinematic modal player supporting YouTube (privacy-enhanced), Vimeo, and MP4.
 * Includes accessibility controls (ARIA, focus restore, ESC key trap, scroll lock)
 * and deep integration with associated TAMYIZ publications.
 */

import { escapeText } from '../tamyiz-unified-app.js';

let activeVideo = null;
let previousActiveElement = null;
let escListener = null;

export function openVideoModal(video) {
  if (!video) return;
  activeVideo = video;
  previousActiveElement = document.activeElement;

  let modalEl = document.getElementById('tmz-films-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'tmz-films-modal';
    modalEl.className = 'tmz-video-modal-overlay';
    document.body.appendChild(modalEl);
  }

  // Prevent background scrolling
  document.body.classList.add('tmz-modal-open');

  let mediaHtml = '';
  if (video.provider === 'youtube') {
    mediaHtml = `
      <iframe
        src="${escapeText(video.embedUrl || `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`)}"
        title="${escapeText(video.title)}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin allow-presentation"
        class="tmz-video-player-frame"
      ></iframe>
    `;
  } else if (video.provider === 'vimeo') {
    mediaHtml = `
      <iframe
        src="${escapeText(video.embedUrl || `https://player.vimeo.com/video/${video.videoId}?autoplay=1&dnt=1`)}"
        title="${escapeText(video.title)}"
        frameborder="0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin allow-presentation"
        class="tmz-video-player-frame"
      ></iframe>
    `;
  } else if (video.provider === 'mp4') {
    mediaHtml = `
      <video
        controls
        autoplay
        playsinline
        preload="metadata"
        class="tmz-video-player-video"
      >
        <source src="${escapeText(video.videoUrl)}" type="video/mp4" />
        Your browser does not support HTML5 video playback.
      </video>
    `;
  } else {
    mediaHtml = `
      <div class="tmz-video-player-error">
        <p>Unable to load video format. <a href="${escapeText(video.videoUrl)}" target="_blank" rel="noopener noreferrer">Watch on external player ↗</a></p>
      </div>
    `;
  }

  const bookHtml = video.book ? `
    <aside class="tmz-video-modal-book" aria-label="Featured publication">
      <div class="tmz-video-book-badge">Associated Publication</div>
      <div class="tmz-video-book-row">
        <img
          src="${escapeText(video.book.coverThumb || `/api/cover/${video.book.id}?s=sm`)}"
          alt="${escapeText(video.book.name)} cover"
          class="tmz-video-book-cover"
          width="54"
          height="80"
          loading="lazy"
        />
        <div class="tmz-video-book-info">
          <h4 class="tmz-video-book-title">${escapeText(video.book.name)}</h4>
          <p class="tmz-video-book-tagline">${escapeText(video.book.tagline || '')}</p>
          <div class="tmz-video-book-actions">
            <span class="tmz-video-book-price">₹${escapeText(video.book.price || 0)}</span>
            <a
              href="/edition/${escapeText(video.book.slug)}"
              class="tmz-btn-book-link"
              data-nav="/edition/${escapeText(video.book.slug)}"
              data-close-video-modal
            >
              Read This E-Book <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </aside>
  ` : '';

  modalEl.innerHTML = `
    <div class="tmz-video-modal-backdrop" data-action="close-video-modal"></div>
    <div
      class="tmz-video-modal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tmz-video-dialog-title"
      tabindex="-1"
    >
      <button
        type="button"
        class="tmz-video-modal-close"
        data-action="close-video-modal"
        aria-label="Close video player (Esc)"
        id="tmz-video-close-btn"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="tmz-video-player-container">
        <div class="tmz-video-aspect-16-9">
          ${mediaHtml}
        </div>
      </div>

      <div class="tmz-video-modal-details">
        <div class="tmz-video-modal-meta">
          <div class="tmz-video-modal-tags">
            <span class="tmz-pill-cat">${escapeText(video.category || 'Film')}</span>
            ${video.duration ? `<span class="tmz-pill-dur">${escapeText(video.duration)}</span>` : ''}
            <span class="tmz-pill-brand">TAMYIZ FILMS</span>
          </div>
          <h3 id="tmz-video-dialog-title" class="tmz-video-modal-title">${escapeText(video.title)}</h3>
          ${video.description ? `<p class="tmz-video-modal-desc">${escapeText(video.description)}</p>` : ''}
        </div>

        ${bookHtml}
      </div>
    </div>
  `;

  modalEl.classList.add('is-open');

  // Trap ESC key
  if (escListener) {
    window.removeEventListener('keydown', escListener);
  }
  escListener = (e) => {
    if (e.key === 'Escape') {
      closeVideoModal();
    }
  };
  window.addEventListener('keydown', escListener);

  // Focus close button for accessibility
  setTimeout(() => {
    const closeBtn = document.getElementById('tmz-video-close-btn');
    if (closeBtn) closeBtn.focus();
  }, 50);
}

export function closeVideoModal() {
  const modalEl = document.getElementById('tmz-films-modal');
  if (modalEl) {
    // Empty innerHTML immediately to stop video playback and audio
    modalEl.innerHTML = '';
    modalEl.classList.remove('is-open');
  }

  document.body.classList.remove('tmz-modal-open');

  if (escListener) {
    window.removeEventListener('keydown', escListener);
    escListener = null;
  }

  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    previousActiveElement.focus();
    previousActiveElement = null;
  }

  activeVideo = null;
}

// Expose globally for inline DOM click events
window.openTamyizVideoModal = openVideoModal;
window.closeTamyizVideoModal = closeVideoModal;

