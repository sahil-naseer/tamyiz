/**
 * TAMYIZ™ Home Page (Editorial Flagship)
 * Route: /
 */

import { products, isAvailable, anyAvailable, buyLabel, loadState } from '../../data/products.js';
import { siteConfig } from '../../data/site-config.js';
import { store } from '../store.js';
import { principlesSection, formatGuideSection } from './sections.js';
import { escapeText } from '../tamyiz-unified-app.js';
import { openVideoModal } from '../components/video-modal.js';

/** True facts only, counted from the catalogue on /admin: number of e-books, total pages (when every book has a page count). */
function heroProof() {
  if (loadState.loading) return '<li>Written by Sahil &amp; Basit</li>';
  const items = [];
  if (products.length) items.push(`${products.length} e-book${products.length === 1 ? '' : 's'}`);
  const pages = products.map((p) => Number(((p.specifications || []).find((s) => s.label === 'Pages') || {}).value));
  if (products.length && pages.every((n) => n > 0)) items.push(`${pages.reduce((a, b) => a + b, 0)} pages`);
  items.push('Written by Sahil &amp; Basit');
  items.push(anyAvailable() ? 'Instant PDF download' : 'Pre-order on WhatsApp');
  return items.map((t) => `<li>${t}</li>`).join('');
}

/** What the shop shows with no books: an honest error with "Try again" if loading failed, else "first e-books on the way". */
export function emptyShopBlock() {
  if (loadState.loading) {
    const card = `
              <div class="tmz-card-skeleton" aria-hidden="true">
                <div class="tmz-skel tmz-skel-cover"></div>
                <div class="tmz-skel tmz-skel-line"></div>
                <div class="tmz-skel tmz-skel-line tmz-skel-short"></div>
                <div class="tmz-skel tmz-skel-btn"></div>
              </div>`;
    return `<span class="sr-only" role="status">Loading the e-books…</span>${card.repeat(3)}`;
  }
  if (loadState.failed) {
    return `
              <div class="tmz-shop-empty" role="alert">
                <h3>Couldn't load the e-books</h3>
                <p>Your connection may have dropped, or our server is busy. Your bag is safe.</p>
                <button type="button" class="tmz-btn tmz-btn-solid" onclick="window.tamyizApp.retryProducts()">Try again</button>
              </div>`;
  }
  return `
              <div class="tmz-shop-empty">
                <h3>First e-books on the way</h3>
                <p>We are writing them now. Message us on WhatsApp and we will tell you the day the first one is out.</p>
                <a class="tmz-btn tmz-btn-line" href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer">Tell me when it's out ↗</a>
              </div>`;
}

export function renderHomePage(appInstance) {
  // Newest 3 ebooks (the list from /admin is newest first)
  const featuredProducts = products.slice(0, 3);

  const html = `
    <div class="tamyiz-page-home">
      <!-- 1. HERO: the name's meaning as the headline; "About us" (the two founders) on the right. Nothing here is tied to one product. -->
      <section class="tmz-hero" id="hero">
        <div class="tmz-hero-inner">
          <div class="tmz-hero-copy">
            <p class="tmz-hero-meaning"><strong>Tamyiz</strong> (<span lang="ar">تمييز</span>): the ability to tell things apart.</p>
            <h1 class="tmz-hero-title">Learn to tell <span class="tmz-nowrap">the difference.</span></h1>
            <p class="tmz-hero-lede">Short, practical e-books on AI and the digital world, written for beginners. Download the PDF and start reading in a minute.</p>
            <div class="tmz-hero-ctas">
              <a href="/#editions" class="tmz-btn tmz-btn-solid" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/#editions')">Browse the e-books <span aria-hidden="true">↓</span></a>
              <a href="/#philosophy" class="tmz-btn tmz-btn-line" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/#philosophy')">How we write</a>
            </div>
            <ul class="tmz-hero-proof">${heroProof()}</ul>
          </div>

          <aside class="tmz-about-card" aria-labelledby="hero-about-title">
            <div class="tmz-about-head">
              <h2 id="hero-about-title">About us</h2>
              <span>The two people behind every TAMYIZ product</span>
            </div>
            <div class="tmz-about-people">
              <figure>
                <img src="/assets/images/founders/basit-portrait.webp" alt="Basit Majeed" width="480" height="600" loading="eager" decoding="async" />
                <figcaption>
                  <strong>Basit Majeed</strong>
                  <span>Co-founder · Security &amp; Research</span>
                  <q>Knowledge carries responsibility.</q>
                </figcaption>
              </figure>
              <figure>
                <img src="/assets/images/founders/sahil-portrait.webp" alt="Sahil Naseer" width="480" height="600" loading="eager" decoding="async" />
                <figcaption>
                  <strong>Sahil Naseer</strong>
                  <span>Co-founder · AI/ML &amp; Build</span>
                  <q>Nothing stays unless it earns its place.</q>
                </figcaption>
              </figure>
            </div>
            <div class="tmz-about-foot">
              <a href="/atelier" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/atelier')">Read the full story <span aria-hidden="true">→</span></a>
              <a href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="tmz-about-wa">Questions? WhatsApp us, we reply ourselves.</a>
            </div>
          </aside>
        </div>
      </section>

      <!-- 2. BRAND PROMISE / VALUE STRIP -->
      <div class="tamyiz-promise-strip w-full">
        <div class="max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 py-8 pr-20 lg:pr-28">
          <div class="tamyiz-promise-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-neutral-800 gap-8 lg:gap-0 items-start w-full">
            <div class="tamyiz-promise-item lg:px-8 first:lg:pl-0 last:lg:pr-0">
              <span class="tamyiz-promise-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </span>
              <div>
                <strong>Instant download</strong>
                <p>Your PDF download appears on screen the moment you pay.</p>
              </div>
            </div>
            <div class="tamyiz-promise-item lg:px-8 first:lg:pl-0 last:lg:pr-0">
              <span class="tamyiz-promise-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 22h20"></path>
                  <path d="M3 22L19 6a3 3 0 0 0-4.24-4.24L2 14.5V22z"></path>
                  <path d="M7 17l2-2"></path>
                  <path d="M10 14l2-2"></path>
                  <path d="M13 11l2-2"></path>
                </svg>
              </span>
              <div>
                <strong>Reads anywhere</strong>
                <p>Phone, tablet, laptop or Kindle. Nothing to install.</p>
              </div>
            </div>
            <div class="tamyiz-promise-item lg:px-8 first:lg:pl-0 last:lg:pr-0">
              <span class="tamyiz-promise-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18.178 8c5.096 0 5.096 8 0 8-2.67 0-4.67-2.67-6.178-5.333C10.5 8 8.5 8 5.822 8c-5.096 0-5.096 8 0 8 2.67 0 4.67-2.67 6.178-5.333C13.5 16 15.5 16 18.178 16z"></path>
                </svg>
              </span>
              <div>
                <strong>Plain English</strong>
                <p>Written for beginners, built around real examples.</p>
              </div>
            </div>
            <div class="tamyiz-promise-item lg:px-8 first:lg:pl-0 last:lg:pr-0">
              <span class="tamyiz-promise-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <path d="M9 12l2 2 4-4"></path>
                </svg>
              </span>
              <div>
                <strong>Real people</strong>
                <p>Questions? WhatsApp the founders directly.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. LATEST E-BOOKS -->
      <section id="editions" class="tamyiz-section py-14 md:py-24 scroll-mt-24" style="background: var(--color-offwhite);">
        <div class="container">
          <div class="tamyiz-shop-header" style="align-items: flex-end; margin-bottom: 2.5rem;">
            <div>
              <span style="color: var(--color-red-ink); font-family: var(--font-sub); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; display: inline-block; margin-bottom: 0.5rem;">The shop</span>
              <h2 style="font-family: var(--font-display); font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 900; text-transform: uppercase;">Latest e-books</h2>
            </div>
            ${products.length > 3 ? `<button class="tamyiz-btn-nav-outline" onclick="window.tamyizApp.navigateTo('/editions')">
              <span>View all ${products.length} e-books</span>
              <span>→</span>
            </button>` : ''}
          </div>

          <!-- 3-Card Equal-Height Grid -->
          <div class="tamyiz-product-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8">
            ${featuredProducts.length ? featuredProducts.map(p => renderProductCardHtml(p, appInstance)).join('') : emptyShopBlock()}
          </div>

          ${products.length > 3 ? `<div style="text-align: center; margin-top: 3.5rem;">
            <button class="tamyiz-btn-primary-large" onclick="window.tamyizApp.navigateTo('/editions')">
              <span>SEE ALL ${products.length} E-BOOKS</span>
              <span>→</span>
            </button>
          </div>` : ''}
        </div>
      </section>

      <!-- 3B. TAMYIZ FILMS: VIDEO SHOWCASE PREVIEW -->
      <div id="tmz-home-films-mount"></div>

      <!-- 4. HOW WE WRITE -->
${principlesSection({ id: 'philosophy' })}

      <!-- 5. (The founders are introduced in the hero card; the full story is on /atelier.) -->

      <!-- 5B. FORMAT GUIDE -->
${formatGuideSection()}

    </div>
  `;

  // Asynchronously populate the films showcase section without blocking render
  setTimeout(() => loadHomeFilmsShowcase(), 0);

  return html;
}

export async function loadHomeFilmsShowcase() {
  const mount = document.getElementById('tmz-home-films-mount');
  if (!mount) return;
  try {
    const res = await fetch('/api/films');
    if (!res.ok) {
      mount.innerHTML = '';
      return;
    }
    const data = await res.json();
    const films = Array.isArray(data.videos) ? data.videos : [];
    const visibleFilms = films.filter((v) => v.homepageVisible !== false);
    if (!visibleFilms.length) {
      mount.innerHTML = '';
      return;
    }

    const featured = visibleFilms.find((v) => v.featured) || visibleFilms[0];
    const secondary = visibleFilms.filter((v) => v.id !== featured.id).slice(0, 2);

    window._homeFilms = visibleFilms;
    window.playHomeFilm = (id) => {
      const f = window._homeFilms?.find((item) => item.id === id);
      if (f && window.openTamyizVideoModal) window.openTamyizVideoModal(f);
    };

    mount.innerHTML = `
      <section id="films" class="tamyiz-section tmz-films-home-section py-14 md:py-24 scroll-mt-24">
        <div class="container">
          <div class="tamyiz-shop-header" style="align-items: flex-end; margin-bottom: 2.5rem;">
            <div>
              <span style="color: var(--color-red-ink); font-family: var(--font-sub); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; display: inline-block; margin-bottom: 0.5rem;">TAMYIZ FILMS</span>
              <h2 style="font-family: var(--font-display); font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 900; text-transform: uppercase;">Ideas deserve to be seen.</h2>
              <p style="color: var(--color-muted); font-size: 1rem; max-width: 620px; margin-top: 0.5rem;">Explore the thinking, stories and perspectives behind our publications.</p>
            </div>
            <button class="tamyiz-btn-nav-outline" onclick="window.tamyizApp.navigateTo('/films')">
              <span>Explore all films</span>
              <span>→</span>
            </button>
          </div>

          <div class="tmz-home-films-layout">
            <!-- Featured Video -->
            <div class="tmz-home-film-lead">
              <div
                class="tmz-home-film-thumb-wrap"
                role="button"
                tabindex="0"
                aria-label="Play ${escapeText(featured.title)}"
                onclick="window.playHomeFilm('${escapeText(featured.id)}')"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.playHomeFilm('${escapeText(featured.id)}');}"
              >
                <img
                  src="${escapeText(featured.thumbnailUrl || (featured.provider === 'youtube' && featured.videoId ? `https://img.youtube.com/vi/${featured.videoId}/hqdefault.jpg` : '/og/tamyiz.jpg'))}"
                  alt="${escapeText(featured.title)}"
                  class="tmz-home-film-img"
                  loading="lazy"
                />
                <div class="tmz-home-film-overlay">
                  <div class="tmz-home-film-play-btn" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                  </div>
                  <span class="tmz-home-film-watch-label">WATCH FILM</span>
                </div>
                <div class="tmz-film-meta-bar">
                  <span class="tmz-film-badge-cat">${escapeText(featured.category || 'Film')}</span>
                  ${featured.duration ? `<span class="tmz-film-badge-dur">${escapeText(featured.duration)}</span>` : ''}
                </div>
              </div>

              <div class="tmz-home-film-info">
                <h3 class="tmz-home-film-title">
                  <a href="#" onclick="event.preventDefault(); window.playHomeFilm('${escapeText(featured.id)}')">
                    ${escapeText(featured.title)}
                  </a>
                </h3>
                ${featured.description ? `<p class="tmz-home-film-desc">${escapeText(featured.description)}</p>` : ''}
                ${featured.book ? `
                  <a
                    href="/edition/${escapeText(featured.book.slug)}"
                    class="tmz-film-book-link"
                    onclick="event.preventDefault(); window.tamyizApp.navigateTo('/edition/${escapeText(featured.book.slug)}')"
                  >
                    <div class="tmz-film-card-book">
                      <img src="${escapeText(featured.book.coverThumb || `/api/cover/${featured.book.id}?s=sm`)}" alt="" width="20" height="28" class="tmz-film-book-thumb" />
                      <span>${escapeText(featured.book.name)}</span>
                      <span class="tmz-film-book-arrow" aria-hidden="true">→</span>
                    </div>
                  </a>
                ` : ''}
              </div>
            </div>

            <!-- Secondary Videos Column -->
            ${secondary.length ? `
              <div class="tmz-home-films-sidebar">
                ${secondary.map((sec) => `
                  <div class="tmz-home-film-side-card">
                    <div
                      class="tmz-home-side-thumb-wrap"
                      role="button"
                      tabindex="0"
                      aria-label="Play ${escapeText(sec.title)}"
                      onclick="window.playHomeFilm('${escapeText(sec.id)}')"
                      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); window.playHomeFilm('${escapeText(sec.id)}');}"
                    >
                      <img
                        src="${escapeText(sec.thumbnailUrl || (sec.provider === 'youtube' && sec.videoId ? `https://img.youtube.com/vi/${sec.videoId}/hqdefault.jpg` : '/og/tamyiz.jpg'))}"
                        alt="${escapeText(sec.title)}"
                        class="tmz-home-side-img"
                        loading="lazy"
                      />
                      <div class="tmz-film-play-overlay">
                        <div class="tmz-film-play-btn tmz-film-play-btn-sm" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div class="tmz-home-side-info">
                      <div class="tmz-home-side-meta">
                        <span class="tmz-badge-cat-sm">${escapeText(sec.category || 'Film')}</span>
                        ${sec.duration ? `<span class="tmz-badge-dur-sm">${escapeText(sec.duration)}</span>` : ''}
                      </div>
                      <h4 class="tmz-home-side-title">
                        <a href="#" onclick="event.preventDefault(); window.playHomeFilm('${escapeText(sec.id)}')">
                          ${escapeText(sec.title)}
                        </a>
                      </h4>
                      ${sec.book ? `
                        <a
                          href="/edition/${escapeText(sec.book.slug)}"
                          class="tmz-home-side-book"
                          onclick="event.preventDefault(); window.tamyizApp.navigateTo('/edition/${escapeText(sec.book.slug)}')"
                        >
                          ${escapeText(sec.book.name)} →
                        </a>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div style="text-align: center; margin-top: 3rem;">
            <button class="tamyiz-btn-primary-large" onclick="window.tamyizApp.navigateTo('/films')">
              <span>EXPLORE ALL FILMS</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </section>
    `;
  } catch {
    mount.innerHTML = '';
  }
}

/**
 * Reusable Equal-Height Product Card Renderer (Rule 4)
 */
export function renderProductCardHtml(p, appInstance) {
  const slug = p.slug || p.id;
  const hasVariants = p.variants && p.variants.options && p.variants.options.length > 0;
  const currentSelectedOption = appInstance.selectedSizes[p.id] || (hasVariants ? p.variants.options[0] : "Standard");
  
  // Calculate dynamic variant pricing
  let currentPrice = p.price;
  let currentOrigPrice = p.originalPrice;
  if (p.variants?.prices && p.variants.prices[currentSelectedOption]) {
    currentPrice = p.variants.prices[currentSelectedOption].price;
    currentOrigPrice = p.variants.prices[currentSelectedOption].originalPrice;
  }

  return `
    <div class="tamyiz-product-card flex flex-col h-full" id="card-${p.id}" data-product-card="${p.id}">
      <div class="tamyiz-product-thumb" onclick="window.tamyizApp.navigateTo('/edition/${slug}')">
        <img src="${p.thumb || p.images[0]}" alt="${p.name}" class="tamyiz-img-primary" width="480" height="720" loading="lazy" decoding="async" />
        <img src="${p.images[1] || p.thumb || p.images[0]}" alt="" aria-hidden="true" class="tamyiz-img-hover" width="480" height="720" loading="lazy" decoding="async" />

        <span class="tamyiz-badge-digital">${isAvailable(p) ? p.badge : 'COMING SOON'}</span>

        <button class="tamyiz-btn-wishlist ${store.isInWishlist(p.id) ? 'active' : ''}" data-id="${p.id}" onclick="event.stopPropagation(); window.tamyizApp.toggleWishlist('${p.id}')" aria-label="Wishlist">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${store.isInWishlist(p.id) ? 'var(--color-red)' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
      </div>

      <div class="tamyiz-product-info flex flex-col flex-1 justify-between">
        <div>
          <span class="tamyiz-product-cat">${p.category}</span>
          ${isAvailable(p) ? '' : '<span class="tamyiz-card-status">Coming soon</span>'}
          <h3 class="tamyiz-product-name"><a href="/edition/${slug}" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/edition/${slug}')">${p.name}</a></h3>

          <div class="tamyiz-product-pricing flex items-baseline gap-2" id="pricing-${p.id}" aria-label="Price: ₹${currentPrice.toLocaleString('en-IN')}${currentOrigPrice ? `, original price ₹${currentOrigPrice.toLocaleString('en-IN')}` : ''}">
            <span class="tamyiz-price-cur font-bold text-black" id="price-${p.id}">₹${currentPrice.toLocaleString('en-IN')}</span>
            <span class="tamyiz-price-orig line-through" id="orig-price-${p.id}" style="${currentOrigPrice ? '' : 'display:none;'}">${currentOrigPrice ? `₹${currentOrigPrice.toLocaleString('en-IN')}` : ''}</span>
          </div>

          ${p.video ? `
            <div style="margin: 0.5rem 0 0.2rem;">
              <button
                type="button"
                class="tamyiz-card-video-pill-btn"
                onclick="event.stopPropagation(); window.tamyizApp.playProductVideo('${p.id}')"
                title="Watch preview video of ${p.name}"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Watch video preview</span>
              </button>
            </div>
          ` : ''}

          ${hasVariants ? `
            <div class="tamyiz-size-selector-wrap" onclick="event.stopPropagation()">
              <div class="tamyiz-size-selector-label font-mono text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <span class="text-gray-500 font-semibold">FORMAT:</span>
                <span style="color: var(--color-black); font-weight: 800;" id="size-label-${p.id}" class="tamyiz-size-label">${currentSelectedOption}</span>
              </div>
              <div class="tamyiz-size-pills-row" role="group" aria-label="Format selection">
                ${p.variants.options.map(opt => `
                  <button class="tamyiz-size-pill-btn ${opt === currentSelectedOption ? 'active' : ''}" 
                          aria-pressed="${opt === currentSelectedOption ? 'true' : 'false'}"
                          data-variant="${opt}"
                          onclick="window.tamyizApp.selectProductSize('${p.id}', '${opt}', this)">
                    ${opt}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="tamyiz-card-actions-row">
          <button class="tamyiz-btn-quick-add" id="btn-quick-${p.id}" style="background: var(--color-red); font-size: 0.82rem; padding: 0.82rem; border: none; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;" onclick="window.tamyizApp.quickAddToCart('${p.id}')">
            ${buyLabel(p, currentPrice, 'card')}
          </button>
          <a class="tamyiz-btn-preview-trigger" href="/edition/${slug}" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/edition/${slug}')">
            <span>See what's inside →</span>
          </a>
        </div>
      </div>
    </div>
  `;
}
