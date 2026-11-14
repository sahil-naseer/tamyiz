/**
 * TAMYIZ™ Editions Catalog Page
 * Route: /editions
 */

import { products } from '../../data/products.js';
import { renderProductCardHtml, emptyShopBlock } from './home-page.js';
import { siteConfig } from '../../data/site-config.js';

export function renderEditionsPage(appInstance) {
  const filteredList = appInstance.getFilteredAndSortedProducts();

  return `
    <div class="tamyiz-page-editions">
      <!-- DEDICATED HEADER BANNER -->
      <section class="tamyiz-page-header">
        <div class="container">
          <div class="tamyiz-page-header-inner">
            <span class="tamyiz-page-badge">
              The shop
            </span>
            <h1 class="tamyiz-page-title">
              All e-books
            </h1>
            <p class="tamyiz-page-description">
              Practical guides as instant PDF downloads. Read them on your phone, tablet, laptop or Kindle.
            </p>
          </div>
        </div>
      </section>

      <!-- CATALOG CONTROLS & PRODUCT GRID -->
      <section id="editions-catalog" class="tamyiz-section py-10 md:py-16 scroll-mt-24" style="background: var(--color-offwhite);">
        <div class="container">
          <!-- Live Search & Sorting Toolbar -->
          <div class="tamyiz-collection-toolbar flex flex-col sm:flex-row gap-3 w-full"${products.length ? '' : ' hidden'}>
            <div class="tamyiz-search-box relative flex-1 w-full sm:min-w-[240px] sm:max-w-md">
              <span class="tamyiz-search-icon absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                type="text"
                id="artifact-search-input"
                class="tamyiz-search-input w-full pl-10 pr-9 py-2.5 bg-white border border-gray-300 rounded-full text-sm text-black placeholder-gray-400 transition-colors focus:ring-2 focus:ring-black focus:outline-none focus:border-transparent"
                placeholder="Search e-books"
                value="${String(appInstance.searchQuery).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
                data-input-action="search"
                aria-label="Search e-books"
              />
              <button
                id="artifact-search-clear"
                class="tamyiz-search-clear ${appInstance.searchQuery ? 'visible' : ''}"
                data-action="clear-search"
                aria-label="Clear search"
              >✕</button>
            </div>

            <div class="tamyiz-sort-box">
              <label for="artifact-sort-select" class="tamyiz-sort-label">Sort:</label>
              <select id="artifact-sort-select" class="tamyiz-sort-select" data-change-action="sort">
                <option value="featured" ${appInstance.sortBy === 'featured' ? 'selected' : ''}>Newest first</option>
                <option value="price-asc" ${appInstance.sortBy === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
                <option value="price-desc" ${appInstance.sortBy === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
              </select>
            </div>
          </div>

          <!-- Status Indicator -->
          <div class="tamyiz-collection-status" id="collection-status"${products.length ? '' : ' hidden'}>
            ${appInstance.getCollectionStatusText()}
          </div>

          <!-- Product Grid (Rule 4: Equal-Height Cards) -->
          <h2 class="sr-only">All e-books</h2>
          <div class="tamyiz-product-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-8" id="product-grid">
            ${products.length === 0 ? emptyShopBlock() : filteredList.length === 0 ? `
              <div style="grid-column: 1 / -1; text-align: center; padding: 4.5rem 1.5rem; background: #FFFFFF; border: 1px dashed var(--color-border); border-radius: 6px;">
                <div style="font-family: var(--font-display); font-size: 1.4rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem;">
                  No e-books match your search
                </div>
                <p style="color: var(--color-grey); font-size: 0.88rem; margin-bottom: 1.5rem;">
                  Try a different word, or see every e-book.
                </p>
                <button class="tamyiz-btn-nav-outline" data-action="reset-filters">
                  Show all e-books
                </button>
              </div>
            ` : filteredList.map(p => renderProductCardHtml(p, appInstance)).join('')}
          </div>
        </div>
      </section>
    </div>
  `;
}
