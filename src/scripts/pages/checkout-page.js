/**
 * TAMYIZ™ Dedicated Instant Digital Checkout Page
 * Route: /checkout
 */

import { store, hasCoupons } from '../store.js';
import { escapeText } from '../tamyiz-unified-app.js';
import { brandInfo } from '../../data/content.js';
import { siteConfig } from '../../data/site-config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderCheckoutPage(appInstance) {
  // If we have an active confirmed order in the session, show the Download Vault
  if (appInstance.confirmedOrder) {
    return renderOrderVaultHtml(appInstance.confirmedOrder);
  }

  const cart = store.cart;
  if (cart.length === 0) {
    return `
      <div class="tamyiz-page-checkout">
        <section class="tamyiz-page-header">
          <div class="container">
            <div class="tamyiz-page-header-inner">
              <span class="tamyiz-page-badge">INSTANT DIGITAL CHECKOUT</span>
              <h1 class="tamyiz-page-title">Your bag is empty</h1>
              <p class="tamyiz-page-description">
                You haven't added any e-books yet.
              </p>
            </div>
          </div>
        </section>

        <section class="py-16 text-center">
          <div class="container">
            <p style="color: var(--color-grey); font-size: 1rem; margin-bottom: 2rem;">
              Have a look at the shop and add the one you want.
            </p>
            <button class="tamyiz-hero-btn-primary" onclick="window.tamyizApp.navigateTo('/editions')">
              <span>BROWSE THE E-BOOKS</span>
              <span>→</span>
            </button>
          </div>
        </section>
      </div>
    `;
  }

  const subtotal = store.getSubtotal();
  const discount = store.getDiscount();
  const bundleDiscount = Math.min(discount, store.getBundleDiscount());
  const couponDiscount = Math.max(0, discount - bundleDiscount);
  const total = store.getTotal();
  const coupon = store.coupon;

  return `
    <div class="tamyiz-page-checkout">
      <!-- DEDICATED HEADER BANNER -->
      <section class="tamyiz-page-header">
        <div class="container">
          <div class="tamyiz-page-header-inner">
            <span class="tamyiz-page-badge">SECURE CHECKOUT BY RAZORPAY</span>
            <h1 class="tamyiz-page-title">Checkout</h1>
            <p class="tamyiz-page-description">
              Your download button appears on screen as soon as the payment is confirmed. Download your PDF straight away. We also email you a receipt with the same download link.
            </p>
          </div>
        </div>
      </section>

      <!-- 2-COLUMN CHECKOUT ARCHITECTURE -->
      <section class="tamyiz-section py-10 md:py-16 pb-16 md:pb-24" style="background: var(--color-offwhite);">
        <div class="container">
          <div class="tamyiz-checkout-grid">
            <!-- LEFT COLUMN: CUSTOMER DETAILS & PAYMENT METHOD -->
            <div class="tamyiz-checkout-left-col">
              <form id="checkout-form" onsubmit="event.preventDefault(); window.tamyizApp.submitCheckout();">
                <!-- STEP 1: INSTANT DELIVERY DETAILS -->
                <div class="tamyiz-checkout-card mb-6">
                  <div class="tamyiz-step-header">
                    <span class="tamyiz-step-num">01</span>
                    <div>
                      <h2 class="tamyiz-step-title">Your details</h2>
                      <p class="tamyiz-step-sub">So we can find your order and help if anything goes wrong.</p>
                    </div>
                  </div>

                  <div class="space-y-4">
                    <div>
                      <label class="tamyiz-form-label" for="chk-name">Full Name *</label>
                      <input
                        type="text"
                        id="chk-name"
                        required
                        class="tamyiz-form-input"
                        placeholder="Your full name"
                        autocomplete="name"
                      />
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label class="tamyiz-form-label" for="chk-email">Email Address *</label>
                        <input
                          type="email"
                          id="chk-email"
                          required
                          class="tamyiz-form-input"
                          placeholder="yourname@gmail.com"
                          autocomplete="email"
                        />
                      </div>
                      <div>
                        <label class="tamyiz-form-label" for="chk-phone">Mobile Number *</label>
                        <input
                          type="tel"
                          id="chk-phone"
                          required
                          class="tamyiz-form-input"
                          placeholder="10-digit mobile number"
                          autocomplete="tel"
                        />
                      </div>
                    </div>
                    <p style="font-size: 0.78rem; color: #5E5E59; margin: 0.75rem 0 0; line-height: 1.5;">
                      We use these to send your receipt and download links, and may remind you once if you don't finish the order.
                      <a href="/legal/privacy" onclick="event.preventDefault(); window.tamyizApp.openLegalModal('privacy')" style="color: #0B0B0B; text-decoration: underline;">Privacy policy</a>
                    </p>
                  </div>
                </div>

                <!-- STEP 2: PAYMENT (the method is chosen in Razorpay's own window) -->
                <div class="tamyiz-checkout-card mb-6">
                  <div class="tamyiz-step-header" style="border-bottom: 0; margin-bottom: 0; padding-bottom: 0;">
                    <span class="tamyiz-step-num">02</span>
                    <div>
                      <h2 class="tamyiz-step-title">Payment</h2>
                      <p class="tamyiz-step-sub">Secure payment by Razorpay. Choose UPI, card, net banking or a wallet in the next window.</p>
                    </div>
                  </div>
                </div>

                <!-- GUARANTEE BADGE & SUBMIT BUTTON -->
                <div class="tamyiz-digital-delivery-card mb-6">
                  <div class="tamyiz-digital-delivery-badge">
                    <span style="display:inline-flex; align-items:center;" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                      </svg>
                    </span>
                    <span>Instant download</span>
                  </div>
                  <p style="font-size: 0.84rem; color: #555; margin: 0; line-height: 1.5;">
                    Your download button appears on this screen as soon as the payment is confirmed.
                  </p>
                </div>

                <button type="submit" class="tamyiz-btn-submit-order w-full">
                  <span id="checkout-submit-label">Pay &amp; download →</span>
                  <span>•</span>
                  <span>₹${total.toLocaleString('en-IN')}</span>
                </button>
              </form>
            </div>

            <!-- RIGHT COLUMN: STICKY ORDER SUMMARY -->
            <div class="tamyiz-checkout-right-col">
              <div class="tamyiz-checkout-summary-card">
                <div class="tamyiz-summary-header">
                  <h2>Order Summary</h2>
                  <span class="text-xs font-bold text-neutral-500 uppercase">${cart.length} e-book${cart.length > 1 ? 's' : ''}</span>
                </div>

                <!-- Items List -->
                <div class="tamyiz-summary-items-list">
                  ${cart.map(item => `
                    <div class="tamyiz-summary-item" id="summary-item-${item.cartItemId}">
                      <img src="${item.image}" alt="${item.name}" class="summary-item-thumb" />
                      <div class="summary-item-info">
                        <h3 class="summary-item-name">${item.name}</h3>
                        <span class="summary-item-variant">${item.variant}</span>
                        <div class="flex items-center gap-3 mt-1.5">
                          <span class="text-xs font-mono text-neutral-500 uppercase tracking-wider">Single License (1)</span>
                          <strong class="text-sm font-bold text-black">₹${item.price.toLocaleString('en-IN')}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="summary-item-remove"
                        onclick="window.tamyizApp.removeSummaryItem('${item.cartItemId}')"
                        title="Remove from bag"
                        aria-label="Remove ${item.name} from bag"
                      >✕</button>
                    </div>
                  `).join('')}
                </div>

                <!-- Coupon Section (only when a promo code exists) -->
                <div class="tamyiz-summary-coupon-box" style="${hasCoupons() || coupon ? '' : 'display: none;'}">
                  ${coupon ? `
                    <div class="flex justify-between items-center text-sm" style="color: #1E7B2E; font-weight: 700;">
                      <div class="flex items-center gap-1.5">
                        <span style="display:inline-flex; align-items:center; gap:0.35rem;">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                          </svg>
                          ${coupon.code}
                        </span>
                        <span class="text-xs text-neutral-500">(${coupon.label})</span>
                      </div>
                      <button
                        type="button"
                        onclick="window.tamyizApp.removeCouponFromCheckout()"
                        style="color: var(--color-red-ink); background: none; border: none; cursor: pointer; font-size: 0.75rem; font-weight: 800;"
                      >
                        REMOVE
                      </button>
                    </div>
                  ` : `
                    <div class="flex gap-2">
                      <input
                        type="text"
                        id="checkout-coupon-input"
                        placeholder="PROMO CODE"
                        class="tamyiz-coupon-input flex-1"
                        style="text-transform: uppercase;"
                        onkeydown="if(event.key==='Enter'){ event.preventDefault(); window.tamyizApp.applyCouponFromCheckout(); }"
                      />
                      <button
                        type="button"
                        class="tamyiz-btn-apply-coupon"
                        onclick="window.tamyizApp.applyCouponFromCheckout()"
                      >
                        Apply Code
                      </button>
                    </div>
                    <div id="checkout-coupon-feedback" style="display: none; font-size: 0.75rem; margin-top: 0.45rem; font-weight: 600;"></div>
                  `}
                </div>

                <!-- Price Calculations Breakdown -->
                <div class="tamyiz-summary-calc-rows">
                  <div class="flex justify-between text-sm py-1">
                    <span class="text-neutral-600">Subtotal</span>
                    <strong class="text-neutral-900">₹${subtotal.toLocaleString('en-IN')}</strong>
                  </div>

                  ${bundleDiscount > 0 ? `
                    <div class="flex justify-between text-sm py-1" style="color: #1E7B2E;">
                      <span>Discount for ${store.cart.length >= 3 ? '3+ books (25%)' : '2 books (20%)'}</span>
                      <strong>−₹${bundleDiscount.toLocaleString('en-IN')}</strong>
                    </div>
                  ` : ''}
                  ${couponDiscount > 0 ? `
                    <div class="flex justify-between text-sm py-1" style="color: #1E7B2E;">
                      <span>Coupon ${coupon ? escapeText(coupon.code) : ''}</span>
                      <strong>−₹${couponDiscount.toLocaleString('en-IN')}</strong>
                    </div>
                  ` : ''}

                  <div class="flex justify-between text-sm py-1">
                    <span class="text-neutral-600">Delivery</span>
                    <span style="color: #1E7B2E; font-weight: 700;">Instant download</span>
                  </div>

                  <div class="tamyiz-summary-total-row">
                    <span>Total Payable</span>
                    <span class="tamyiz-summary-total-val">₹${total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <!-- Trust Microcopy -->
                <div class="tamyiz-trust-bar mt-4 pt-4 border-t border-gray-100">
                  <span>Instant UPI</span>
                  <span class="tamyiz-trust-bar-dot">•</span>
                  <span>Cards</span>
                  <span class="tamyiz-trust-bar-dot">•</span>
                  <span>Instant download</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

/**
 * Order Confirmation & Download Vault View
 */
export function renderOrderVaultHtml(order) {
  const currentDateStr = order.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  // Show the TAMYIZ reference (same as the receipt email), not Razorpay's long order id.
  const invoiceNumber = escapeText(order.referenceId || order.orderId);

  return `
    <div class="tamyiz-page-order-vault py-12 md:py-20">
      <div class="container max-w-4xl mx-auto">
        <div class="tamyiz-vault-card">
          <!-- Success Seal -->
          <div class="tamyiz-vault-seal no-print">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <span class="tamyiz-vault-kicker no-print">Payment received</span>
          <h1 class="tamyiz-vault-title no-print">Your e-book is ready</h1>
          <p class="tamyiz-vault-sub no-print">
            Order <strong>${invoiceNumber}</strong> • Total Paid: <strong>₹${order.total.toLocaleString('en-IN')}</strong>
          </p>
          <p class="no-print" style="font-size: 0.9rem; color: #555; margin-bottom: 2rem;">
            Download your e-book now and keep the file. Your receipt is below. If you ever lose the file, WhatsApp us your order number and we will send it again.
          </p>

          <!-- Download Cards for Each Item -->
          <div class="tamyiz-vault-downloads-list mb-8 no-print">
            ${order.items.map(item => `
              <div class="tamyiz-download-item-card">
                <div class="flex items-center gap-4">
                  <img src="${item.image}" alt="${item.name}" class="vault-item-thumb" />
                  <div class="text-left">
                    <h4 class="vault-item-title">${item.name}</h4>
                    <span class="vault-item-spec">PDF e-book • personal licence for one person</span>
                  </div>
                </div>

                <div class="mt-4 sm:mt-0">
                  <a
                    href="${item.downloadUrl || '#'}"
                    ${item.downloadUrl ? 'target="_blank" rel="noopener noreferrer"' : ''}
                    class="tamyiz-btn-download-vault"
                    style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; text-decoration: none;"
                    ${!item.downloadUrl ? `onclick="event.preventDefault(); window.tamyizApp.triggerDownloadSim('${item.name}')"` : ''}
                  >
                    <span>${item.actionLabel || 'Download Edition ↗'}</span>
                  </a>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Receipt actions -->
          <div class="no-print flex flex-wrap gap-3 justify-center items-center mb-6">
            <button
              class="tamyiz-hero-btn-primary"
              style="padding: 0.75rem 1.6rem; font-size: 0.82rem; display:inline-flex; align-items:center; gap:0.4rem;"
              onclick="window.print()"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Print receipt</span>
            </button>
            <button
              class="tamyiz-btn-nav-outline"
              style="padding: 0.75rem 1.6rem; font-size: 0.82rem; display:inline-flex; align-items:center; gap:0.4rem;"
              onclick="window.tamyizApp.downloadInvoice('${order.orderId}')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Save receipt</span>
            </button>
            <a
              href="https://wa.me/${siteConfig.whatsappNumber}?text=Hello%20TAMYIZ,%20I%20just%20completed%20Order%20${encodeURIComponent(order.referenceId || order.orderId)}%20and%20would%20like%20my%20receipt%20confirmation."
              target="_blank"
              rel="noopener noreferrer"
              class="tamyiz-btn-nav-outline"
              style="padding: 0.75rem 1.4rem; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.4rem; color: #1E7B2E; border-color: #1E7B2E;"
            >
              <span>WhatsApp Confirmation ↗</span>
            </a>
            <button
              class="tamyiz-btn-nav-outline"
              style="padding: 0.75rem 1.4rem; font-size: 0.82rem;"
              onclick="window.tamyizApp.resetOrderAndReturnHome()"
            >
              <span>Continue Browsing Editions →</span>
            </button>
          </div>

          <!-- PRINTABLE RECEIPT -->
          <div class="tamyiz-invoice-card" id="tamyiz-printable-invoice">
            <div class="tamyiz-invoice-header">
              <div class="tamyiz-invoice-brand">
                <h2>TAMYIZ™</h2>
                <div style="font-size: 0.72rem; color: #555; font-family: var(--font-sub); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.2rem;">
                  Practical e-books by Sahil &amp; Basit
                </div>
                <div style="font-size: 0.76rem; color: #555; margin-top: 0.35rem; line-height: 1.45;">
                  Sopore, Jammu &amp; Kashmir 193201, India<br/>
                  Phone / WhatsApp: ${siteConfig.phone} • Email: ${siteConfig.email}
                </div>
              </div>

              <div class="tamyiz-invoice-meta sm:text-right">
                <div class="tamyiz-invoice-badge">PAYMENT RECEIPT</div>
                <div style="margin-top: 0.5rem; font-family: var(--font-sub); font-size: 0.78rem; line-height: 1.5;">
                  <div><strong>RECEIPT NO:</strong> ${invoiceNumber}</div>
                  <div><strong>ORDER ID:</strong> #${order.orderId}</div>
                  <div><strong>DATE OF ISSUE:</strong> ${currentDateStr}</div>
                  <div><strong>PAYMENT STATUS:</strong> <span style="color: #1E7B2E; font-weight: 800;">PAID (CONFIRMED)</span></div>
                </div>
              </div>
            </div>

            <div class="tamyiz-invoice-divider"></div>

            <!-- Customer & License Details -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
              <div>
                <span class="tamyiz-invoice-section-label">PAID BY</span>
                <div style="font-size: 0.8rem; color: #555; line-height: 1.45; margin-top: 0.15rem;">
                  Email: ${order.shippingAddress?.email ? esc(order.shippingAddress.email) : '—'}<br/>
                  ${order.shippingAddress?.phone ? `WhatsApp: ${esc(order.shippingAddress.phone)}` : ''}
                </div>
              </div>

              <div class="sm:text-right">
                <span class="tamyiz-invoice-section-label">DELIVERY &amp; LICENSE SPECIFICATION</span>
                <div style="font-size: 0.9rem; font-weight: 700; color: #111;">
                  Instant PDF download
                </div>
                <div style="font-size: 0.8rem; color: #555; line-height: 1.45; margin-top: 0.15rem;">
                  Personal licence for one person
                </div>
              </div>
            </div>

            <!-- Itemized Table -->
            <div class="tamyiz-invoice-table-wrap">
              <table class="tamyiz-invoice-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">EDITION / TITLE</th>
                    <th style="text-align: left;">SPECIFICATION / FORMAT</th>
                    <th style="text-align: center;">QTY</th>
                    <th style="text-align: right;">PRICE</th>
                    <th style="text-align: right;">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(item => `
                    <tr>
                      <td>
                        <strong>${item.name}</strong>
                        <div style="font-size: 0.72rem; color: #6B6B6B;">Full Single-Seat License Included</div>
                      </td>
                      <td>${item.variant || 'Standard Digital Edition'}</td>
                      <td style="text-align: center;">1</td>
                      <td style="text-align: right;">₹${item.price.toLocaleString('en-IN')}</td>
                      <td style="text-align: right; font-weight: 700;">₹${item.price.toLocaleString('en-IN')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- Financial Totals -->
            <div class="flex justify-end mt-4">
              <div style="width: 290px;">
                <div class="flex justify-between py-1 text-xs">
                  <span style="color: #666;">Subtotal:</span>
                  <span style="font-weight: 600;">₹${order.subtotal.toLocaleString('en-IN')}</span>
                </div>
                ${order.discount ? `
                  <div class="flex justify-between py-1 text-xs" style="color: var(--color-red-ink);">
                    <span>Discount${order.coupon?.code ? ` (incl. coupon ${escapeText(order.coupon.code)})` : ''}:</span>
                    <span style="font-weight: 700;">−₹${order.discount.toLocaleString('en-IN')}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between py-1 text-xs">
                  <span style="color: #666;">Delivery:</span>
                  <span style="color: #1E7B2E; font-weight: 700;">Instant download (no charge)</span>
                </div>
                <div class="flex justify-between py-2 text-sm font-bold border-t border-black mt-2" style="font-family: var(--font-display);">
                  <span>Total Paid:</span>
                  <span style="color: var(--color-red-ink);">₹${order.total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <!-- Receipt footer -->
            <div class="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-gray-500">
              <div>
                <div>TAMYIZ™ • run by Basit Majeed &amp; Sahil Naseer</div>
                <div>Personal licence for one person. DRM-free PDF.</div>
              </div>
              <div class="mt-2 sm:mt-0 font-mono text-right" style="font-size: 0.7rem;">
                Questions? ${siteConfig.email}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
