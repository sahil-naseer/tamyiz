/**
 * TAMYIZ™ Home Page (Editorial Flagship)
 * Route: /
 */

import { products, isAvailable, anyAvailable, buyLabel, loadState } from '../../data/products.js';
import { siteConfig } from '../../data/site-config.js';
import { store } from '../store.js';
import { heroArt } from '../illustrations.js';
import { escapeText } from '../tamyiz-unified-app.js';
import { openVideoModal } from '../components/video-modal.js';

/** One quiet line of true facts, counted from the catalogue on /admin (no boxes, no counters). */
function heroProof() {
  const items = [];
  if (!loadState.loading && products.length) items.push(`${products.length} e-book${products.length === 1 ? '' : 's'}`);
  items.push('Written by Sahil &amp; Basit');
  if (!loadState.loading) items.push(anyAvailable() ? 'Instant PDF download' : 'Pre-order on WhatsApp');
  return items.join(' <span aria-hidden="true">·</span> ');
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
                <button type="button" class="tmz-btn tmz-btn-solid" data-action="retry-products">Try again</button>
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
      <!-- 1. HERO (25 Nov 2026, calm pass): one message, one main button, one quiet fact line, then the drawing.
           The headline is the name's meaning; the line under it says plainly what we sell. Not tied to one product. -->
      <section class="tmz-hero" id="hero">
        <div class="tmz-hero-inner">
          <div class="tmz-hero-copy">
            <p class="tmz-hero-meaning"><strong>Tamyiz</strong> (<span lang="ar">تمييز</span>): the ability to tell things apart.</p>
            <h1 class="tmz-hero-title"><span class="tmz-line"><span>Learn to tell</span></span> <span class="tmz-line"><span><span class="tmz-mark tmz-nowrap">the difference.</span></span></span></h1>
            <p class="tmz-hero-lede">Short, practical e-books for beginners. Download the PDF and start reading in a minute.</p>
            <div class="tmz-hero-ctas">
              <a href="/#editions" class="tmz-btn tmz-btn-solid" data-nav="/#editions">Browse the e-books <span class="tmz-btn-arrow" aria-hidden="true">↓</span></a>
              <a href="/philosophy" class="tmz-hero-link" data-nav="/philosophy">How we write <span aria-hidden="true">→</span></a>
            </div>
            <p class="tmz-hero-proof">${heroProof()}</p>
          </div>
          <div class="tmz-hero-art" data-draw>${heroArt()}</div>
        </div>
      </section>

      <!-- 1B. ABOUT US: the two founders, in a frame right under the hero (the full story is on /atelier). -->
      <section class="tmz-founders" aria-labelledby="hero-about-title">
        <div class="tmz-founders-inner">
          <div class="tmz-founders-head">
            <h2 class="tmz-label" id="hero-about-title">About us</h2>
            <p class="tmz-founders-lead">TAMYIZ is two people, Basit and Sahil, writing the clear, practical guides we wished we'd had.</p>
          </div>
          <div class="tmz-frame tmz-about-people">
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
            <a href="/atelier" data-nav="/atelier">Read the full story <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <!-- 3. LATEST E-BOOKS -->
      <section id="editions" class="tamyiz-section py-14 md:py-24 scroll-mt-24" style="background: var(--color-offwhite);">
        <div class="container">
          <div class="tamyiz-shop-header" style="align-items: flex-end; margin-bottom: 2.5rem;">
            <div>
              <span class="tmz-label">The shop</span>
              <h2 style="font-family: var(--font-display); font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 900; text-transform: uppercase;">Latest e-books</h2>
            </div>
            ${products.length > 3 ? `<a href="/editions" class="tmz-hero-link" data-nav="/editions">See all ${products.length} e-books <span aria-hidden="true">→</span></a>` : ''}
          </div>

          <!-- 3-Card Equal-Height Grid -->
          <div class="tamyiz-product-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8">
            ${featuredProducts.length ? featuredProducts.map(p => renderProductCardHtml(p, appInstance)).join('') : emptyShopBlock()}
          </div>

        </div>
      </section>

      <!-- (25 Nov 2026) "How we write", "Read it anywhere" and the films preview now live only on their own pages
           (/philosophy, /films), so home is four bands: hero, latest e-books, about us, closing line. -->

      <!-- 6. CLOSING LINE: one last, plain invitation. Honest about whether anything can be bought yet. -->
      <section class="tmz-closing">
        <div class="container">
          <span class="tmz-label">${anyAvailable() ? 'Start here' : 'Coming soon'}</span>
          ${anyAvailable()
            ? `<h2 class="tmz-closing-title">Pick an e-book and <span class="tmz-mark tmz-nowrap">start reading</span> in a minute.</h2>
          <div class="tmz-hero-ctas">
            <a href="/editions" class="tmz-btn tmz-btn-solid" data-nav="/editions">See all the e-books <span aria-hidden="true">→</span></a>
          </div>`
            : `<h2 class="tmz-closing-title">The first e-books are <span class="tmz-mark tmz-nowrap">on the way.</span></h2>
          <div class="tmz-hero-ctas">
            <a href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="tmz-btn tmz-btn-solid">Tell me when it's out ↗</a>
          </div>`}
        </div>
      </section>

    </div>
  `;

  return html;
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
      <div class="tamyiz-product-thumb" data-nav="/edition/${slug}">
        <img src="${p.thumb || p.images[0]}" alt="${p.name}" class="tamyiz-img-primary" width="480" height="720" loading="lazy" decoding="async" />
        <img src="${p.images[1] || p.thumb || p.images[0]}" alt="" aria-hidden="true" class="tamyiz-img-hover" width="480" height="720" loading="lazy" decoding="async" />

        ${isAvailable(p) ? '' : '<span class="tamyiz-badge-digital">COMING SOON</span>'}

        <button class="tamyiz-btn-wishlist ${store.isInWishlist(p.id) ? 'active' : ''}" data-id="${p.id}" data-action="toggle-wishlist" data-stop aria-label="Wishlist">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${store.isInWishlist(p.id) ? 'var(--color-red)' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
      </div>

      <div class="tamyiz-product-info flex flex-col flex-1 justify-between">
        <div>
          ${isAvailable(p) ? '' : '<span class="tamyiz-card-status">Coming soon</span>'}
          <h3 class="tamyiz-product-name"><a href="/edition/${slug}" data-nav="/edition/${slug}">${p.name}</a></h3>

          <div class="tamyiz-product-pricing flex items-baseline gap-2" id="pricing-${p.id}" aria-label="Price: ₹${currentPrice.toLocaleString('en-IN')}${currentOrigPrice ? `, original price ₹${currentOrigPrice.toLocaleString('en-IN')}` : ''}">
            <span class="tamyiz-price-cur font-bold text-black" id="price-${p.id}">₹${currentPrice.toLocaleString('en-IN')}</span>
            <span class="tamyiz-price-orig line-through" id="orig-price-${p.id}" style="${currentOrigPrice ? '' : 'display:none;'}">${currentOrigPrice ? `₹${currentOrigPrice.toLocaleString('en-IN')}` : ''}</span>
          </div>

          ${p.video ? `
            <div style="margin: 0.5rem 0 0.2rem;">
              <button
                type="button"
                class="tamyiz-card-video-pill-btn"
                data-action="play-product-video"
                data-id="${p.id}"
                data-stop
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
            <div class="tamyiz-size-selector-wrap" data-stop>
              <div class="tamyiz-size-selector-label font-mono text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <span class="text-gray-500 font-semibold">FORMAT:</span>
                <span style="color: var(--color-black); font-weight: 800;" id="size-label-${p.id}" class="tamyiz-size-label">${currentSelectedOption}</span>
              </div>
              <div class="tamyiz-size-pills-row" role="group" aria-label="Format selection">
                ${p.variants.options.map(opt => `
                  <button class="tamyiz-size-pill-btn ${opt === currentSelectedOption ? 'active' : ''}" 
                          aria-pressed="${opt === currentSelectedOption ? 'true' : 'false'}"
                          data-variant="${opt}"
                          data-action="select-product-size"
                          data-id="${p.id}">
                    ${opt}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="tamyiz-card-actions-row">
          <button class="tamyiz-btn-quick-add" id="btn-quick-${p.id}" style="background: var(--color-red); font-size: 0.82rem; padding: 0.82rem; border: none; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;" data-action="quick-add" data-id="${p.id}">
            ${buyLabel(p, currentPrice, 'card')}
          </button>
        </div>
      </div>
    </div>
  `;
}
