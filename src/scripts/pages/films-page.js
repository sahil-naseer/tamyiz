/**
 * TAMYIZ FILMS: Dedicated Films & Visual Stories Page
 * Route: /films
 */

import { escapeText } from '../tamyiz-unified-app.js';
import { openVideoModal } from '../components/video-modal.js';

let cachedFilms = null;
let activeCategory = 'all';

export async function fetchFilms() {
  if (cachedFilms) return cachedFilms;
  try {
    const res = await fetch('/api/films');
    if (!res.ok) return [];
    const data = await res.json();
    cachedFilms = Array.isArray(data.videos) ? data.videos : [];
    return cachedFilms;
  } catch (err) {
    console.error('Failed to fetch films:', err);
    return [];
  }
}

export function invalidateFilmsCache() {
  cachedFilms = null;
}

export function renderFilmCard(video, isFeatured = false) {
  const thumbnail = video.thumbnailUrl || (video.provider === 'youtube' && video.videoId ? `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg` : '/og/tamyiz.jpg');

  const bookPill = video.book ? `
    <div class="tmz-film-card-book">
      <img src="${escapeText(video.book.coverThumb || `/api/cover/${video.book.id}?s=sm`)}" alt="" width="20" height="28" class="tmz-film-book-thumb" />
      <span>${escapeText(video.book.name)}</span>
      <span class="tmz-film-book-arrow" aria-hidden="true">→</span>
    </div>
  ` : '';

  return `
    <article class="tmz-film-card ${isFeatured ? 'is-featured' : ''}" data-category="${escapeText(video.category || 'all')}" data-featured-card="${isFeatured ? 'true' : 'false'}"${isFeatured && activeCategory.toLowerCase() === 'all' ? ' style="display: none;"' : ''}>
      <div
        class="tmz-film-thumb-wrap"
        role="button"
        tabindex="0"
        aria-label="Play ${escapeText(video.title)}"
        data-action="play-film"
        data-arg="${escapeText(video.id)}"
      >
        <img
          src="${escapeText(thumbnail)}"
          alt="${escapeText(video.title)}"
          class="tmz-film-thumb-img"
          loading="lazy"
        />
        <div class="tmz-film-play-overlay">
          <div class="tmz-film-play-btn" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>
        <div class="tmz-film-meta-bar">
          <span class="tmz-film-badge-cat">${escapeText(video.category || 'Film')}</span>
          ${video.duration ? `<span class="tmz-film-badge-dur">${escapeText(video.duration)}</span>` : ''}
        </div>
      </div>

      <div class="tmz-film-card-body">
        <h3 class="tmz-film-card-title">
          <a
            href="#"
            data-action="play-film"
            data-arg="${escapeText(video.id)}"
          >
            ${escapeText(video.title)}
          </a>
        </h3>
        ${video.description ? `<p class="tmz-film-card-desc">${escapeText(video.description)}</p>` : ''}

        ${video.book ? `
          <a
            href="/edition/${escapeText(video.book.slug)}"
            class="tmz-film-book-link"
            data-nav="/edition/${escapeText(video.book.slug)}"
            title="Read ${escapeText(video.book.name)}"
          >
            ${bookPill}
          </a>
        ` : ''}
      </div>
    </article>
  `;
}

export function renderFilmsPage(appInstance) {
  // Expose global click dispatcher for films
  window.playFilmById = (id) => {
    if (!cachedFilms) return;
    const film = cachedFilms.find((f) => f.id === id);
    if (film) openVideoModal(film);
  };

  window.filterFilmsCategory = (cat) => {
    activeCategory = cat;
    const isAll = cat.toLowerCase() === 'all';
    const pills = document.querySelectorAll('.tmz-cat-pill');
    pills.forEach((p) => {
      const match = p.getAttribute('data-cat') === cat;
      p.classList.toggle('is-active', match);
    });

    const featuredSection = document.querySelector('.tmz-film-featured-section');
    if (featuredSection) {
      featuredSection.style.display = isAll ? '' : 'none';
    }

    const cards = document.querySelectorAll('.tmz-films-grid .tmz-film-card');
    cards.forEach((c) => {
      const isFeat = c.getAttribute('data-featured-card') === 'true';
      const itemCat = c.getAttribute('data-category') || '';
      const show = isAll ? !isFeat : itemCat.toLowerCase() === cat.toLowerCase();
      c.style.display = show ? 'flex' : 'none';
    });
  };

  setTimeout(async () => {
    const mount = document.getElementById('tmz-films-page-content');
    if (!mount) return;

    const films = await fetchFilms();
    if (!films.length) {
      mount.innerHTML = `
        <div class="tmz-films-empty">
          <div class="tmz-films-empty-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <h2>Films in Production</h2>
          <p>We are crafting our first cinematic trailers, motion graphics, and visual essays. Check back soon or browse our full collection of written e-books.</p>
          <div style="margin-top: 1.5rem;">
            <a href="/editions" class="tmz-btn tmz-btn-solid" data-nav="/editions">Browse All E-Books →</a>
          </div>
        </div>
      `;
      return;
    }

    // Extract unique categories
    const categories = ['all'];
    for (const f of films) {
      if (f.category && !categories.map((c) => c.toLowerCase()).includes(f.category.toLowerCase())) {
        categories.push(f.category);
      }
    }

    const featuredFilm = films.find((f) => f.featured) || films[0];

    mount.innerHTML = `
      <!-- Featured Film Hero Slot -->
      ${featuredFilm ? `
        <section class="tmz-film-featured-section" aria-label="Featured film">
          <div class="tmz-film-featured-banner">
            <div
              class="tmz-featured-thumb-wrap"
              role="button"
              tabindex="0"
              aria-label="Play featured film: ${escapeText(featuredFilm.title)}"
              data-action="play-film"
              data-arg="${escapeText(featuredFilm.id)}"
            >
              <img
                src="${escapeText(featuredFilm.thumbnailUrl || (featuredFilm.provider === 'youtube' && featuredFilm.videoId ? `https://img.youtube.com/vi/${featuredFilm.videoId}/maxresdefault.jpg` : '/og/tamyiz.jpg'))}"
                alt="${escapeText(featuredFilm.title)}"
                class="tmz-featured-thumb-img"
              />
              <div class="tmz-featured-play-overlay">
                <div class="tmz-featured-play-btn" aria-hidden="true">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </div>
                <span class="tmz-featured-play-label">WATCH FILM</span>
              </div>
            </div>

            <div class="tmz-featured-details">
              <div class="tmz-featured-badges">
                <span class="tmz-pill-featured">FEATURED FILM</span>
                <span class="tmz-pill-cat">${escapeText(featuredFilm.category || 'Visual Story')}</span>
                ${featuredFilm.duration ? `<span class="tmz-pill-dur">${escapeText(featuredFilm.duration)}</span>` : ''}
              </div>
              <h2 class="tmz-featured-title">${escapeText(featuredFilm.title)}</h2>
              ${featuredFilm.description ? `<p class="tmz-featured-desc">${escapeText(featuredFilm.description)}</p>` : ''}

              <div class="tmz-featured-actions">
                <button
                  type="button"
                  class="tmz-btn tmz-btn-solid tmz-btn-watch"
                  data-action="play-film"
                  data-arg="${escapeText(featuredFilm.id)}"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>Play Film</span>
                </button>

                ${featuredFilm.book ? `
                  <a
                    href="/edition/${escapeText(featuredFilm.book.slug)}"
                    class="tmz-btn tmz-btn-line tmz-btn-read"
                    data-nav="/edition/${escapeText(featuredFilm.book.slug)}"
                  >
                    <span>Read ${escapeText(featuredFilm.book.name)}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                ` : ''}
              </div>
            </div>
          </div>
        </section>
      ` : ''}

      <!-- Category Filter Pills -->
      ${categories.length > 2 ? `
        <div class="tmz-films-filter-bar" role="navigation" aria-label="Film categories">
          ${categories.map((c) => `
            <button
              type="button"
              class="tmz-cat-pill ${activeCategory.toLowerCase() === c.toLowerCase() ? 'is-active' : ''}"
              data-cat="${escapeText(c)}"
              data-action="filter-films"
              data-arg="${escapeText(c)}"
            >
              ${c === 'all' ? 'All Films' : escapeText(c)}
            </button>
          `).join('')}
        </div>
      ` : ''}

      <!-- Video Grid -->
      <section class="tmz-films-grid" aria-label="All films">
        <h2 class="sr-only">All films</h2>
        ${films.map((f) => renderFilmCard(f, Boolean(featuredFilm && f.id === featuredFilm.id))).join('')}
      </section>

      <!-- From Screen to Page Banner -->
      <section class="tmz-films-books-bridge">
        <div class="tmz-films-bridge-inner">
          <span class="tmz-bridge-eyebrow">From Screen to Page</span>
          <h2 class="tmz-bridge-title">Every film begins with deep study.</h2>
          <p class="tmz-bridge-text">Our films are brief previews into full monographs and tactical guides. Download any edition instantly to start reading.</p>
          <a
            href="/editions"
            class="tmz-btn tmz-btn-solid"
            data-nav="/editions"
          >
            Explore Complete E-Books Catalog <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>
    `;
  }, 10);

  return `
    <div class="tamyiz-page-films">
      <!-- Films Header Hero -->
      <section class="tmz-films-hero">
        <div class="tmz-films-hero-inner">
          <span class="tmz-films-eyebrow">TAMYIZ FILMS</span>
          <h1 class="tmz-films-hero-title">Ideas deserve to be seen.</h1>
          <p class="tmz-films-hero-sub">Explore the thinking, stories, and cinematic perspectives behind our publications.</p>
        </div>
      </section>

      <div class="container" style="max-width: 1240px; margin: 0 auto; padding: 0 1.25rem 5rem;">
        <div id="tmz-films-page-content">
          <div class="tmz-page-loading" role="status">
            <div class="tmz-skel tmz-skel-cover" style="height: 380px; border-radius: 16px;"></div>
            <div class="tmz-skel tmz-skel-line" style="margin-top: 24px;"></div>
            <div class="tmz-skel tmz-skel-line tmz-skel-short"></div>
            <span class="sr-only">Loading films…</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

