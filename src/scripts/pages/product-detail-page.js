/**
 * TAMYIZ™ Dedicated Product Detail Page (Full Page PDP)
 * Route: /edition/:slug
 */

import { findProductBySlugOrId, getRelatedProducts, isAvailable, buyLabel } from '../../data/products.js';
import { renderProductCardHtml } from './home-page.js';

export function renderProductDetailPage(slug, appInstance) {
  const product = findProductBySlugOrId(slug);

  if (!product) {
    return `
      <div class="container py-24 text-center">
        <h2 style="font-family: var(--font-display); font-size: 2rem; font-weight: 900; text-transform: uppercase; margin-bottom: 1rem;">
          Edition Not Found
        </h2>
        <p style="color: var(--color-grey); margin-bottom: 2rem;">
          We couldn't find that e-book. It may have moved.
        </p>
        <button class="tamyiz-hero-btn-primary" onclick="window.tamyizApp.navigateTo('/editions')">
          <span>See all e-books</span>
          <span>→</span>
        </button>
      </div>
    `;
  }

  const hasVariants = product.variants && product.variants.options && product.variants.options.length > 0;
  const currentSelectedOption = appInstance.selectedSizes[product.id] || (hasVariants ? product.variants.options[0] : "Standard");
  const related = getRelatedProducts(product.id, 3);
  const activeImgIndex = appInstance.activePdpImageIndex || 0;
  const currentImg = product.images[activeImgIndex] || product.images[0];
  const hasSample = Boolean(product.sampleExcerpt);

  return `
    <div class="tamyiz-page-pdp">
      <!-- BREADCRUMB & BACK NAVIGATION -->
      <div class="tamyiz-pdp-breadcrumb-bar">
        <div class="container">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <nav class="tamyiz-breadcrumbs" aria-label="Breadcrumb">
              <a href="/" class="crumb-link" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/')">Home</a>
              <span class="crumb-sep">/</span>
              <a href="/editions" class="crumb-link" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/editions')">E-books</a>
              <span class="crumb-sep">/</span>
              <span class="crumb-current">${product.name}</span>
            </nav>

            <button class="tamyiz-btn-back-link" onclick="window.tamyizApp.navigateTo('/editions')">
              <span>← All e-books</span>
            </button>
          </div>
        </div>
      </div>

      <!-- MAIN 2-COLUMN PDP LAYOUT -->
      <section class="tamyiz-pdp-main-section py-8 md:py-14">
        <div class="container">
          <div class="tamyiz-pdp-full-grid">
            <!-- LEFT COLUMN: INTERACTIVE GALLERY & LIVE SAMPLE VIEWER -->
            <div class="tamyiz-pdp-col-left">
              <div class="tamyiz-pdp-main-img-wrap">
                <img
                  id="pdp-main-image"
                  src="${currentImg}"
                  alt="${product.name}"
                  class="tamyiz-pdp-main-img"
                  loading="eager"
                  fetchpriority="high"
                />
                <span class="tamyiz-pdp-badge-pill">${isAvailable(product) ? product.badge : `COMING SOON • ${product.badge}`}</span>
              </div>

              <!-- Thumbnail Gallery / Toggle -->
              ${product.images.length > 1 ? `
                <div class="tamyiz-pdp-thumbs mt-4">
                  ${product.images.map((img, idx) => `
                    <button
                      class="tamyiz-pdp-thumb-btn ${idx === activeImgIndex ? 'active' : ''}"
                      onclick="window.tamyizApp.setPdpImage(${idx})"
                      aria-label="View image ${idx + 1}"
                    >
                      <img src="${img}" alt="${product.name} view ${idx + 1}" />
                      <span class="tamyiz-thumb-label">${idx === 0 ? 'Cover Art' : 'Interior Sample'}</span>
                    </button>
                  `).join('')}
                </div>
              ` : ''}

              <!-- INTERACTIVE ON-PAGE SAMPLE VIEWER -->
              ${hasSample ? `
                <div class="tamyiz-pdp-sample-box mt-8">
                  <div class="tamyiz-pdp-sample-head">
                    <div>
                      <span class="tamyiz-sample-kicker">${product.sampleExcerpt ? 'Free sample' : 'Inside the book'}</span>
                      <h3 class="tamyiz-sample-title">${product.sampleExcerpt ? 'Read Sample Chapter &amp; Excerpt' : 'Chapters'}</h3>
                    </div>
                    <button class="tamyiz-sample-toggle-btn" id="sample-toggle-btn" onclick="window.tamyizApp.toggleSampleViewer()">
                      <span id="sample-toggle-text">Expand Preview</span>
                      <span id="sample-toggle-icon">↓</span>
                    </button>
                  </div>

                  <div class="tamyiz-pdp-sample-content" id="pdp-sample-content">
                    ${product.sampleExcerpt ? `
                      <div class="tamyiz-excerpt-paper">
                        <div class="tamyiz-excerpt-chap-label">${product.sampleExcerpt.chapter}</div>
                        <h4 class="tamyiz-excerpt-chap-title">${product.sampleExcerpt.subtitle}</h4>
                        <div class="tamyiz-excerpt-body tamyiz-excerpt-dropcap">
                          ${product.sampleExcerpt.text}
                        </div>
                        <div class="tamyiz-excerpt-pullquote">
                          "Distinction is not loud; it is undeniable weight and proportion."
                        </div>
                        <div class="tamyiz-reader-specs-chip" style="display:flex; align-items:center; gap:0.5rem;">
                          <span style="display:inline-flex; align-items:center; gap:0.35rem;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M2 22h20"></path>
                              <path d="M3 22L19 6a3 3 0 0 0-4.24-4.24L2 14.5V22z"></path>
                            </svg>
                            Sample pages
                          </span>
                          <span>•</span>
                          <span style="display:inline-flex; align-items:center; gap:0.35rem;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                              <line x1="12" y1="18" x2="12.01" y2="18"></line>
                            </svg>
                            Retina Optimized
                          </span>
                        </div>
                      </div>
                    ` : ''}

                    ${product.tableOfContents ? `
                      <div class="tamyiz-toc-box mt-6">
                        <h5 style="font-family: var(--font-sub); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.85rem; color: var(--color-black);">
                          Contents:
                        </h5>
                        <ul class="tamyiz-toc-list">
                          ${product.tableOfContents.map(toc => `
                            <li class="tamyiz-toc-item">${toc}</li>
                          `).join('')}
                        </ul>
                      </div>
                    ` : ''}
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- RIGHT COLUMN: PRODUCT DETAILS, ACTIONS & STRUCTURED ACCORDIONS -->
            <div class="tamyiz-pdp-col-right">
              <div class="tamyiz-pdp-details-card">
                <div class="flex items-center justify-between gap-3 mb-2">
                  <span class="tamyiz-pdp-cat">${product.category}</span>
                  ${isAvailable(product) ? `<span class="tamyiz-tag-dispatch" style="display:inline-flex; align-items:center; gap:0.35rem;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    INSTANT DOWNLOAD
                  </span>` : `<span class="tamyiz-tag-dispatch tamyiz-tag-soon">COMING SOON</span>`}
                </div>

                <h1 class="tamyiz-pdp-title">${product.name}</h1>
                <p class="tamyiz-pdp-tagline">${product.tagline}</p>


                <!-- Pricing -->
                <div class="tamyiz-pdp-pricing">
                  <span class="tamyiz-pdp-price-cur">₹${product.price.toLocaleString('en-IN')}</span>
                  ${product.originalPrice ? `
                    <span class="tamyiz-pdp-price-orig">₹${product.originalPrice.toLocaleString('en-IN')}</span>
                    <span class="tamyiz-pdp-save-badge">SAVE ${Math.round((1 - product.price / product.originalPrice) * 100)}%</span>
                  ` : ''}
                </div>
                <div class="tamyiz-pdp-tax-note">
                  ${isAvailable(product) ? 'Final price, no extra charges • Instant download after payment' : 'Coming soon • Pre-order on WhatsApp and we will message you the day it is ready. Details may change before release.'}
                </div>

                <!-- Format Selection Pills -->
                ${hasVariants ? `
                  <div class="tamyiz-pdp-format-section">
                    <div class="flex justify-between items-center mb-2">
                      <span class="font-bold text-xs uppercase tracking-wider text-neutral-600">
                        Select ${product.variants.type || 'Format'}:
                      </span>
                      <span class="text-xs font-bold text-black" id="pdp-selected-size-label">
                        ${currentSelectedOption}
                      </span>
                    </div>

                    <div class="tamyiz-pdp-format-pills">
                      ${product.variants.options.map(opt => `
                        <button
                          type="button"
                          class="tamyiz-pdp-format-pill ${opt === currentSelectedOption ? 'active' : ''}"
                          onclick="window.tamyizApp.selectProductSize('${product.id}', '${opt}', this)"
                        >
                          <span class="pill-dot"></span>
                          <span>${opt}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                <!-- Primary & Direct Actions -->
                <div class="tamyiz-pdp-actions-stack">
                  <button
                    class="tamyiz-pdp-btn-add"
                    onclick="window.tamyizApp.quickAddToCart('${product.id}')"
                  >
                    ${buyLabel(product, product.price, 'pdp')}
                  </button>

                  ${isAvailable(product) ? `<button
                    class="tamyiz-pdp-btn-buy-now"
                    onclick="window.tamyizApp.buyNowDirect('${product.id}')"
                  >
                    <span>Buy Now • Direct Checkout →</span>
                  </button>` : ''}

                  <button
                    type="button"
                    class="tamyiz-pdp-btn-sample"
                    onclick="window.tamyizApp.openSampleModal('${product.id}')"
                    id="pdp-open-sample-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    </svg>
                    <span>Read Free Sample (Chapter 1)</span>
                  </button>
                </div>

                <!-- Trust Guarantee List -->
                <div class="tamyiz-pdp-guarantee-list">
                  <div class="tamyiz-guarantee-item">
                    <span style="display:inline-flex; align-items:center;" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                      </svg>
                    </span>
                    <span>Download button on screen right after payment.</span>
                  </div>
                  <div class="tamyiz-guarantee-item">
                    <span style="display:inline-flex; align-items:center;" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                        <line x1="12" y1="18" x2="12.01" y2="18"></line>
                      </svg>
                    </span>
                    <span>DRM-free PDF: reads on phones, tablets, laptops and Kindle.</span>
                  </div>
                  <div class="tamyiz-guarantee-item">
                    <span style="display:inline-flex; align-items:center;" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18.178 8c5.096 0 5.096 8 0 8-2.67 0-4.67-2.67-6.178-5.333C10.5 8 8.5 8 5.822 8c-5.096 0-5.096 8 0 8 2.67 0 4.67-2.67 6.178-5.333C13.5 16 15.5 16 18.178 16z"></path>
                      </svg>
                    </span>
                    <span>Questions about the book? WhatsApp us: the authors reply themselves.</span>
                  </div>
                </div>

                <!-- Description -->
                <div class="tamyiz-pdp-description-box">
                  <h2 class="tamyiz-pdp-desc-heading">About this book</h2>
                  <p class="tamyiz-pdp-desc">${product.description}</p>
                </div>

                <!-- STRUCTURED SPECS ACCORDION (3 TABS) -->
                <div class="tamyiz-pdp-accordions" id="pdp-accordions">
                  <!-- Accordion 1: What's Inside -->
                  <div class="tamyiz-pdp-acc-item open" id="acc-inside">
                    <button class="tamyiz-pdp-acc-trigger" onclick="window.tamyizApp.toggleAccordion('acc-inside')">
                      <span>01 / WHAT'S INSIDE</span>
                      <span class="tamyiz-pdp-acc-icon">−</span>
                    </button>
                    <div class="tamyiz-pdp-acc-content">
                      ${(product.tableOfContents && product.tableOfContents.length)
                        ? `<ol class="tamyiz-acc-bullets tamyiz-acc-chapters">${product.tableOfContents.map((c) => `<li>${c}</li>`).join('')}</ol>`
                        : `<p style="font-size: 0.88rem; color: #555; margin: 0;">The full chapter list is coming soon. Message us on WhatsApp if you'd like to know more.</p>`}
                    </div>
                  </div>

                  <!-- Accordion 2: Technical Format & Compatibility -->
                  <div class="tamyiz-pdp-acc-item" id="acc-compat">
                    <button class="tamyiz-pdp-acc-trigger" onclick="window.tamyizApp.toggleAccordion('acc-compat')">
                      <span>02 / FORMAT &amp; DEVICES</span>
                      <span class="tamyiz-pdp-acc-icon">+</span>
                    </button>
                    <div class="tamyiz-pdp-acc-content">
                      <div class="tamyiz-spec-table">
                        ${(product.specifications || [
                          { label: "Format", value: "Instant Digital Download (PDF + EPUB bundle)" },
                          { label: "Reader Support", value: "Apple Books, Kindle, Adobe Acrobat, iPad, Android" },
                          { label: "Delivery", value: "Instant download after payment" }
                        ]).map(spec => `
                          <div class="tamyiz-spec-row">
                            <span class="tamyiz-spec-label">${spec.label}</span>
                            <span class="tamyiz-spec-val">${spec.value}</span>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  </div>

                  <!-- Accordion 3: Your copy & refunds -->
                  <div class="tamyiz-pdp-acc-item" id="acc-license">
                    <button class="tamyiz-pdp-acc-trigger" onclick="window.tamyizApp.toggleAccordion('acc-license')">
                      <span>03 / YOUR COPY &amp; REFUNDS</span>
                      <span class="tamyiz-pdp-acc-icon">+</span>
                    </button>
                    <div class="tamyiz-pdp-acc-content">
                      <p style="font-size: 0.86rem; color: #555; line-height: 1.6; margin: 0 0 0.75rem 0;">
                        A DRM-free PDF for your own use: keep it on all your devices and print pages for yourself. Please don't share or resell it.
                      </p>
                      <p style="font-size: 0.86rem; color: #555; line-height: 1.6; margin: 0;">
                        Problem with the file? WhatsApp us and we'll fix it. Charged twice, or a file we can't fix: full refund within 7 days
                        (<a href="/legal/license" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/legal/license')" style="text-decoration: underline;">refund policy</a>).
                      </p>
                    </div>
                  </div>
                </div>

                <!-- READER REVIEWS & SOCIAL PROOF SECTION -->
                <div class="tamyiz-pdp-reviews-box" style="margin-top: 2rem; border-top: 1.5px solid rgba(11,11,11,0.1); padding-top: 1.5rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                      <!-- Stars appear only when real approved reviews exist (filled in by loadProductReviews). -->
                      <div id="pdp-rating-avg-${product.id}" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; font-weight: 800; font-size: 0.95rem; color: #0B0B0B;"></div>
                      <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; font-family: monospace; color: #5E5E59;" id="pdp-reviews-count-${product.id}">
                        Reader reviews
                      </span>
                    </div>
                    <button
                      type="button"
                      onclick="window.tamyizApp.openReviewModal('${product.id}')"
                      style="font-family: var(--font-sub); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.55rem 1rem; border: 1.5px solid #0B0B0B; background: transparent; color: #0B0B0B; border-radius: 4px; cursor: pointer; transition: all 0.2s;"
                      onmouseover="this.style.background='#0B0B0B'; this.style.color='#FFF'"
                      onmouseout="this.style.background='transparent'; this.style.color='#0B0B0B'"
                    >
                      Leave a Review ✍
                    </button>
                  </div>

                  <!-- Reviews Container -->
                  <div id="pdp-reviews-list-${product.id}" class="pdp-reviews-dynamic-list">
                    <p style="font-size: 0.82rem; color: #666; font-style: italic; margin: 0;">
                      Loading reader feedback…
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- BOTTOM SECTION: MORE E-BOOKS (only when there are others) -->
          ${related.length ? `<div class="tamyiz-pdp-related-section mt-16 md:mt-24 pt-12 border-t border-gray-200">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 mb-8">
              <div>
                <span class="text-xs uppercase tracking-widest text-black font-bold">Keep reading</span>
                <h3 class="text-2xl md:text-3xl font-black uppercase font-display tracking-tight mt-1">
                  More from TAMYIZ
                </h3>
              </div>
              <button class="tamyiz-btn-nav-outline" onclick="window.tamyizApp.navigateTo('/editions')">
                <span>All e-books</span>
                <span>→</span>
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8">
              ${related.map(r => renderProductCardHtml(r, appInstance)).join('')}
            </div>
          </div>` : ''}
        </div>
      </section>
    </div>
  `;
}
