/**
 * TAMYIZ™ "Page not found" (any unknown address, and editions that don't exist).
 * Cloudflare also answers these addresses with status 404 (dist/404.html), so search engines don't index them.
 */
import { siteConfig } from '../../data/site-config.js';

export function renderNotFoundPage() {
  return `
    <div class="tamyiz-page-checkout">
      <section class="tamyiz-page-header">
        <div class="container">
          <div class="tamyiz-page-header-inner">
            <span class="tamyiz-page-badge">ERROR 404</span>
            <h1 class="tamyiz-page-title">Page not found</h1>
            <p class="tamyiz-page-description">
              This page doesn't exist, or the book has moved. All our e-books are on one page.
            </p>
          </div>
        </div>
      </section>

      <section class="py-16 text-center">
        <div class="container" style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center;">
          <a href="/editions" class="tamyiz-hero-btn-primary" data-nav="/editions">
            <span>SEE ALL E-BOOKS</span>
            <span aria-hidden="true">→</span>
          </a>
          <a href="/" class="tamyiz-hero-btn-secondary" data-nav="/">
            <span>HOME</span>
          </a>
          <a href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="tamyiz-hero-btn-secondary">
            <span>ASK ON WHATSAPP</span>
          </a>
        </div>
      </section>
    </div>
  `;
}
