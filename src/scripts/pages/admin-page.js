/**
 * TAMYIZ™ Unified Admin Dashboard Controller
 * Modern minimal, responsive SaaS console embedded directly in the unified SPA.
 * Handles:
 *   - Overview (Live KPIs, revenue, real orders, Cloudflare visitor insights)
 *   - Products (CRUD, auto thumbnail generator, PDF upload, status controls)
 *   - Orders & Fulfillments (Searchable orders, one-click download re-send, manual gift orders)
 *   - Coupons & Promotions (Create, toggle, and delete dynamic discount codes)
 *   - Storefront Announcement Banner (Live headline toggle with custom links)
 *   - Customers (Customer profiles, order frequency, aggregated spend)
 *   - Analytics (Visitor graphs and device/source telemetry)
 *   - Settings (Cloudflare KV diagnostics, payment keys, receipt mailer health)
 */

import { siteConfig } from '../../data/site-config.js';
import { markCatalogUpdated } from '../../data/products.js';
import { escapeText } from '../tamyiz-unified-app.js';
import { openVideoModal } from '../components/video-modal.js';

const STATUS_MAP = { draft: 'Draft', soon: 'Coming soon', 'on-sale': 'On sale' };
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

// A finished cover is already portrait 2:3 (or close): never trim those, or light skies and white margins get cut away.
const isCoverShape = (w, h) => { const r = w / h; return r > 0.6 && r < 0.75; };

async function trimBorder(bmp) {
  if (isCoverShape(bmp.width, bmp.height)) return bmp;
  const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];
  const lum = (q) => q[0] + q[1] + q[2];
  const bg = corners.reduce((a, q) => (lum(q) > lum(a) ? q : a));
  if (corners.filter((q) => Math.abs(lum(q) - lum(bg)) < 120).length < 2) return bmp;
  const differs = (x, y) => { const q = at(x, y); return Math.abs(q[0] - bg[0]) + Math.abs(q[1] - bg[1]) + Math.abs(q[2] - bg[2]) > 150; };
  const rowHit = (y) => { let n = 0; for (let x = 0; x < w; x++) n += differs(x, y); return n > w * 0.2; };
  const colHit = (x) => { let n = 0; for (let y = 0; y < h; y++) n += differs(x, y); return n > h * 0.2; };
  const longestRun = (n, hit) => {
    let best = [0, -1], start = -1;
    for (let i = 0; i <= n; i++) {
      if (i < n && hit(i)) { if (start < 0) start = i; }
      else if (start >= 0) { if (i - 1 - start > best[1] - best[0]) best = [start, i - 1]; start = -1; }
    }
    return best;
  };
  const [top, bot] = longestRun(h, rowHit);
  const [left, right] = longestRun(w, colHit);
  const sw = right - left + 1, sh = bot - top + 1;
  if (sw < w * 0.3 || sh < h * 0.3) return bmp;
  if (sw > w * 0.95 && sh > h * 0.95) return bmp;
  if (sw / sh < 0.5 || sw / sh > 0.85) return bmp;
  const pad = 1;
  const sx = Math.max(0, (left - pad) / k), sy = Math.max(0, (top - pad) / k);
  const ex = Math.min(bmp.width, (right + 1 + pad) / k), ey = Math.min(bmp.height, (bot + 1 + pad) / k);
  return createImageBitmap(bmp, Math.round(sx), Math.round(sy), Math.round(ex - sx), Math.round(ey - sy));
}

export class AdminController {
  constructor(app) {
    this.app = app;
    this.isAuthenticated = false;
    this.activeTab = 'overview';
    this.editingProduct = null;
    this.editingFilm = null;
    this.coverBlob = null;
    this.thumbBlob = null;
    this.products = [];
    this.films = [];
    this.orders = [];
    this.customers = [];
    this.coupons = {};
    this.announcement = null;
    this.overviewData = null;
    this.settingsData = null;
    this.statsDays = 7;
    this.orderSearchQuery = '';
    this.isLoading = false;
  }

  async checkAuth() {
    try {
      const res = await this.api('session');
      this.isAuthenticated = res.ok;
      return this.isAuthenticated;
    } catch {
      this.isAuthenticated = false;
      return false;
    }
  }

  async api(path, opts = {}) {
    const res = await fetch(`/api/admin/${path}`, {
      credentials: 'same-origin',
      ...opts,
      headers: { 'X-Tamyiz-Admin': '1', ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, data };
  }

  render(container, subRoute = 'overview') {
    this.container = container;
    const allowed = ['overview', 'products', 'films', 'orders', 'abandoned', 'coupons', 'leads', 'reviews', 'announcement', 'customers', 'analytics', 'settings'];
    this.activeTab = allowed.includes(subRoute) ? subRoute : 'overview';

    container.innerHTML = `
      <div class="tmz-admin-root">
        <div id="tmz-admin-content" class="tmz-admin-container">
          <div class="tmz-admin-loading tmz-frame">
            <p class="tmz-label">TAMYIZ // ADMIN CONSOLE</p>
            <p>Authenticating secure session…</p>
          </div>
        </div>
      </div>
    `;

    this.checkAuth().then((authed) => {
      if (!authed) {
        this.renderLoginView();
      } else {
        this.renderDashboardView();
      }
    });
  }

  renderLoginView() {
    const mount = document.getElementById('tmz-admin-content');
    if (!mount) return;

    mount.innerHTML = `
      <div class="tmz-admin-login-card tmz-frame">
        <div class="tmz-admin-eyebrow-row">
          <span class="tmz-label">RESTRICTED ACCESS</span>
          <span class="tmz-admin-tag-yellow">INTERNAL DESK</span>
        </div>

        <div class="tmz-admin-login-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2"></rect>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
          </svg>
        </div>

        <h1 class="tmz-admin-login-title">TAMYIZ <span class="tmz-mark">Admin Console</span></h1>
        <p class="tmz-admin-login-sub">Enter your administrative password to manage the e-book catalog, customer fulfillment, and editorial operations.</p>
        
        <form id="tmz-admin-login-form">
          <div id="tmz-admin-pass-group" class="tmz-admin-field">
            <label for="tmz-admin-pass" class="tmz-admin-field-label">Master Password</label>
            <input type="password" id="tmz-admin-pass" class="tmz-admin-input" autocomplete="current-password" required placeholder="Enter password…" />
          </div>
          <div id="tmz-admin-otp-group" class="tmz-admin-field" style="display: none;">
            <label for="tmz-admin-otp" class="tmz-admin-field-label">6-Digit Email Security Code</label>
            <p id="tmz-admin-otp-hint" style="font-size: 12px; color: #166224; margin: 0 0 8px; font-weight: 500;"></p>
            <input type="text" id="tmz-admin-otp" class="tmz-admin-input tmz-admin-otp-input" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" placeholder="123456" />
          </div>
          <div id="tmz-admin-login-msg" class="tmz-admin-msg"></div>
          <button type="submit" id="tmz-admin-login-btn" class="tmz-admin-btn tmz-admin-btn-primary tmz-admin-btn-block">Sign In to Dashboard</button>
        </form>
      </div>
    `;

    let otpChallenge = '';
    const form = document.getElementById('tmz-admin-login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = document.getElementById('tmz-admin-pass').value;
      const otpInput = document.getElementById('tmz-admin-otp');
      const otpGroup = document.getElementById('tmz-admin-otp-group');
      const passGroup = document.getElementById('tmz-admin-pass-group');
      const otpHint = document.getElementById('tmz-admin-otp-hint');
      const btn = document.getElementById('tmz-admin-login-btn');
      const msg = document.getElementById('tmz-admin-login-msg');

      btn.disabled = true;
      btn.textContent = 'Verifying…';
      msg.textContent = '';

      const payload = { password: pass };
      if (otpChallenge && otpInput && otpInput.value.trim()) {
        payload.otp = otpInput.value.trim();
        payload.challenge = otpChallenge;
      }

      const res = await this.api('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      btn.disabled = false;

      if (!res.ok) {
        btn.textContent = otpChallenge ? 'Verify 6-Digit Code' : 'Sign In to Dashboard';
        msg.style.color = '#B3261E';
        msg.textContent = res.data.error || 'Authentication rejected.';
        return;
      }

      if (res.data && res.data.requiresOtp) {
        otpChallenge = res.data.challenge || '';
        if (passGroup) passGroup.style.display = 'none';
        if (otpGroup) otpGroup.style.display = 'block';
        if (otpHint) otpHint.textContent = `We emailed a 6-digit login code to ${res.data.emailHint || 'your founder email'}.`;
        btn.textContent = 'Verify 6-Digit Code';
        otpInput?.focus();
        return;
      }

      this.isAuthenticated = true;
      this.renderDashboardView();
    });
  }

  async renderDashboardView() {
    const mount = document.getElementById('tmz-admin-content');
    if (!mount) return;

    const tabs = [
      { id: 'overview', idx: '01', label: 'Overview' },
      { id: 'products', idx: '02', label: 'E-Books & Catalog' },
      { id: 'films', idx: '03', label: 'Films' },
      { id: 'orders', idx: '04', label: 'Orders' },
      { id: 'abandoned', idx: '05', label: 'Abandoned Bags' },
      { id: 'coupons', idx: '06', label: 'Coupons' },
      { id: 'leads', idx: '07', label: 'Sample Leads' },
      { id: 'reviews', idx: '08', label: 'Reviews' },
      { id: 'announcement', idx: '09', label: 'Banner' },
      { id: 'customers', idx: '10', label: 'Customers' },
      { id: 'analytics', idx: '11', label: 'Analytics' },
      { id: 'settings', idx: '12', label: 'Settings' }
    ];

    mount.innerHTML = `
      <!-- Admin Top Bar -->
      <header class="tmz-admin-topbar tmz-frame">
        <div class="tmz-admin-topbar-left">
          <p class="tmz-label">TAMYIZ // INTERNAL CONSOLE</p>
          <h1 class="tmz-admin-topbar-title">Storefront &amp; <span class="tmz-mark">Publishing Desk</span></h1>
          <p class="tmz-admin-topbar-sub">Manage digital monographs, pricing, customer fulfillment, and editorial operations.</p>
        </div>
        <div class="tmz-admin-topbar-actions">
          <span class="tmz-admin-tag-yellow"><i class="tmz-admin-live-dot"></i> SESSION ACTIVE</span>
          <a href="/" target="_blank" rel="noopener noreferrer" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">
            Storefront ↗
          </a>
          <button id="tmz-admin-logout" type="button" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">
            Log out
          </button>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <nav class="tmz-admin-tabs" aria-label="Admin sections">
        ${tabs.map((t) => `
          <button type="button" class="tmz-admin-tab-btn ${this.activeTab === t.id ? 'is-active' : ''}" data-tab="${t.id}">
            <span class="tmz-admin-tab-idx">${t.idx}</span>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </nav>

      <!-- Dynamic Tab Mount -->
      <div id="tmz-admin-tab-body"></div>
    `;

    document.getElementById('tmz-admin-logout').addEventListener('click', async () => {
      await this.api('logout', { method: 'POST' });
      this.isAuthenticated = false;
      this.renderLoginView();
    });

    mount.querySelectorAll('.tmz-admin-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    this.renderActiveTab();
  }

  switchTab(tab) {
    this.activeTab = tab;
    const btns = this.container.querySelectorAll('.tmz-admin-tab-btn');
    btns.forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
    this.renderActiveTab();
  }

  async renderActiveTab() {
    const tabBody = document.getElementById('tmz-admin-tab-body');
    if (!tabBody) return;

    tabBody.innerHTML = `
      <div class="tmz-admin-loading">
        <p class="tmz-label">LOADING SECTION</p>
        <p>Fetching latest store records…</p>
      </div>
    `;

    switch (this.activeTab) {
      case 'overview':
        await this.renderOverviewTab(tabBody);
        break;
      case 'products':
        await this.renderProductsTab(tabBody);
        break;
      case 'films':
        await this.renderFilmsTab(tabBody);
        break;
      case 'orders':
        await this.renderOrdersTab(tabBody);
        break;
      case 'abandoned':
        await this.renderAbandonedTab(tabBody);
        break;
      case 'coupons':
        await this.renderCouponsTab(tabBody);
        break;
      case 'leads':
        await this.renderLeadsTab(tabBody);
        break;
      case 'reviews':
        await this.renderReviewsTab(tabBody);
        break;
      case 'announcement':
        await this.renderAnnouncementTab(tabBody);
        break;
      case 'customers':
        await this.renderCustomersTab(tabBody);
        break;
      case 'analytics':
        await this.renderAnalyticsTab(tabBody);
        break;
      case 'settings':
        await this.renderSettingsTab(tabBody);
        break;
    }
  }

  // ---------------------------------------------------------------- OVERVIEW TAB
  async renderOverviewTab(mount) {
    const res = await this.api('overview');
    const data = res.ok ? res.data : { kpis: {}, bestSellers: [] };
    const kpis = data.kpis || {};

    mount.innerHTML = `
      <div class="tmz-admin-kpi-grid">
        <div class="tmz-admin-kpi-card tmz-admin-kpi-card--ink">
          <div class="tmz-admin-kpi-label">
            <span>01 // Gross Revenue</span>
            <span class="tmz-admin-tag-yellow">LIVE</span>
          </div>
          <b class="tmz-admin-kpi-val">₹${Number(kpis.totalRevenueINR || 0).toLocaleString('en-IN')}</b>
          <span class="tmz-admin-kpi-sub">Verified payments settled</span>
        </div>

        <div class="tmz-admin-kpi-card">
          <div class="tmz-admin-kpi-label"><span>02 // Total Orders</span></div>
          <b class="tmz-admin-kpi-val">${Number(kpis.totalOrders || 0).toLocaleString('en-IN')}</b>
          <span class="tmz-admin-kpi-sub">Fulfilled digital deliveries</span>
        </div>

        <div class="tmz-admin-kpi-card">
          <div class="tmz-admin-kpi-label"><span>03 // Unique Buyers</span></div>
          <b class="tmz-admin-kpi-val">${Number(kpis.totalCustomers || 0).toLocaleString('en-IN')}</b>
          <span class="tmz-admin-kpi-sub">Verified customer profiles</span>
        </div>

        <div class="tmz-admin-kpi-card">
          <div class="tmz-admin-kpi-label"><span>04 // Active E-Books</span></div>
          <b class="tmz-admin-kpi-val">${kpis.onSaleProducts || 0} / ${kpis.totalProducts || 0}</b>
          <span class="tmz-admin-kpi-sub">Editions available in shop</span>
        </div>
      </div>

      <!-- Quick Actions and Best Sellers -->
      <div class="tmz-admin-overview-grid">
        <div class="tmz-admin-panel tmz-frame">
          <p class="tmz-label">QUICK DISPATCH</p>
          <h2 class="tmz-admin-panel-title" style="margin-bottom: 16px;">Fast Administrative Actions</h2>
          <div class="tmz-admin-action-stack">
            <button id="tmz-action-add-book" type="button" class="tmz-admin-quick-btn">
              <span>+ Add New E-Book Guide</span>
              <span aria-hidden="true">→</span>
            </button>
            <button id="tmz-action-gift-book" type="button" class="tmz-admin-quick-btn">
              <span>Send Free Gift / Reviewer Link</span>
              <span aria-hidden="true">→</span>
            </button>
            <button id="tmz-action-coupons" type="button" class="tmz-admin-quick-btn">
              <span>Create / Manage Discount Coupons</span>
              <span aria-hidden="true">→</span>
            </button>
            <button id="tmz-action-banner" type="button" class="tmz-admin-quick-btn">
              <span>Update Store Announcement Banner</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div class="tmz-admin-panel">
          <div class="tmz-admin-panel-head">
            <div>
              <p class="tmz-label" style="margin-bottom: 4px;">SALES LEDGER</p>
              <h2 class="tmz-admin-panel-title">Catalog Status &amp; Sales</h2>
            </div>
            <button type="button" id="tmz-overview-catalog-btn" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">Manage →</button>
          </div>
          ${(data.bestSellers && data.bestSellers.length) ? `
            <div class="tmz-admin-ledger-list">
              ${data.bestSellers.map((b) => `
                <div class="tmz-admin-ledger-row">
                  <div style="min-width: 0;">
                    <strong style="font-family: var(--font-head); font-weight: 600; font-size: 14.5px; display: block; color: #0B0B0B;">${escapeText(b.name)}</strong>
                    <span style="font-size: 12px; color: var(--tmz-graphite, #55554F);">${STATUS_MAP[b.status] || b.status} · ₹${b.price}</span>
                  </div>
                  <span class="tmz-admin-status ${b.sales > 0 ? 'tmz-admin-status--warn' : 'tmz-admin-status--muted'}">
                    ${b.sales} sold
                  </span>
                </div>
              `).join('')}
            </div>
          ` : `
            <p style="color: var(--tmz-graphite, #55554F); font-size: 14px; margin: 0;">No sales recorded yet. Once orders are fulfilled, top-selling e-books will appear here.</p>
          `}
        </div>
      </div>
    `;

    document.getElementById('tmz-overview-catalog-btn')?.addEventListener('click', () => this.switchTab('products'));

    document.getElementById('tmz-action-add-book')?.addEventListener('click', () => {
      this.switchTab('products');
      setTimeout(() => this.openProductForm(null), 50);
    });
    document.getElementById('tmz-action-gift-book')?.addEventListener('click', () => {
      this.switchTab('orders');
      setTimeout(() => {
        document.getElementById('tmz-gift-modal').style.display = 'block';
      }, 50);
    });
    document.getElementById('tmz-action-coupons')?.addEventListener('click', () => this.switchTab('coupons'));
    document.getElementById('tmz-action-banner')?.addEventListener('click', () => this.switchTab('announcement'));
  }

  // ---------------------------------------------------------------- PRODUCTS TAB
  async renderProductsTab(mount) {
    const res = await this.api('products');
    this.products = res.ok ? (res.data.products || []) : [];

    mount.innerHTML = `
      <div id="tmz-product-list-view">
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">CATALOG // MONOGRAPHS</p>
            <h2 class="tmz-admin-section-title">E-Book Catalog &amp; PDF Vault</h2>
            <p class="tmz-admin-section-sub">Manage your digital publications, pricing, covers, and downloadable PDFs.</p>
          </div>
          <button id="tmz-add-product-btn" type="button" class="tmz-admin-btn tmz-admin-btn-primary">
            + Add an E-Book
          </button>
        </div>

        <div id="tmz-product-msg" class="tmz-admin-msg"></div>

        <div class="tmz-admin-product-list">
          ${this.products.length ? this.products.map((b) => {
            const statusCls = b.status === 'on-sale' ? 'tmz-admin-status--live' : b.status === 'soon' ? 'tmz-admin-status--warn' : 'tmz-admin-status--muted';
            return `
            <article class="tmz-admin-product-card">
              ${b.coverUrl ? `
                <img src="${b.coverUrl}" alt="" class="tmz-admin-product-thumb" />
              ` : `
                <div class="tmz-admin-product-placeholder">No cover</div>
              `}
              <div>
                <h3 class="tmz-admin-product-title">${escapeText(b.name)}</h3>
                <p class="tmz-admin-product-tagline">${escapeText(b.tagline || 'No tagline')}</p>
                <div class="tmz-admin-product-meta">
                  <span class="tmz-admin-status ${statusCls}">
                    <span class="tmz-admin-dot"></span>
                    ${STATUS_MAP[b.status] || b.status}
                  </span>
                  <strong style="color: #0B0B0B;">₹${Number(b.price).toLocaleString('en-IN')}</strong>
                  <span>·</span>
                  <span>${b.fileSize ? `PDF ${mb(b.fileSize)}` : '<span style="color:#9E1C14; font-weight:600;">Missing PDF</span>'}</span>
                  ${b.pages ? `<span>·</span><span>${b.pages} pages</span>` : ''}
                  ${b.sampleExcerpt && b.sampleExcerpt.text ? `<span class="tmz-admin-status tmz-admin-status--info">Sample Ready</span>` : ''}
                  ${b.videoUrl ? `<span class="tmz-admin-status tmz-admin-status--ink">▶ Video</span>` : ''}
                </div>
              </div>
              <div class="tmz-admin-product-actions">
                ${b.videoUrl ? `
                  <button type="button" class="tmz-preview-book-video-btn tmz-admin-btn tmz-admin-btn-yellow tmz-admin-btn-sm" data-id="${b.id}">
                    ▶ Preview Video
                  </button>
                ` : ''}
                <button type="button" class="tmz-edit-book-btn tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm" data-id="${b.id}">
                  Edit
                </button>
                ${b.status !== 'draft' ? `
                  <a href="/edition/${b.slug}" target="_blank" rel="noopener noreferrer" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">
                    View ↗
                  </a>
                ` : ''}
                <button type="button" class="tmz-delete-book-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-id="${b.id}" data-name="${escapeText(b.name)}">
                  Delete
                </button>
              </div>
            </article>
          `;
          }).join('') : `
            <div class="tmz-admin-empty">
              <h3>Your catalog is empty</h3>
              <p>Your store does not have any e-books yet.</p>
              <button id="tmz-first-book-btn" type="button" class="tmz-admin-btn tmz-admin-btn-primary">
                Add your first e-book
              </button>
            </div>
          `}
        </div>
      </div>

      <!-- Add / Edit Form Modal/Container -->
      <div id="tmz-product-form-view" class="tmz-admin-panel tmz-frame" style="display: none;"></div>
    `;

    document.getElementById('tmz-add-product-btn')?.addEventListener('click', () => this.openProductForm(null));
    document.getElementById('tmz-first-book-btn')?.addEventListener('click', () => this.openProductForm(null));

    mount.querySelectorAll('.tmz-edit-book-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = this.products.find((x) => x.id === btn.dataset.id);
        if (p) this.openProductForm(p);
      });
    });

    mount.querySelectorAll('.tmz-preview-book-video-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = this.products.find((x) => x.id === btn.dataset.id);
        if (p && p.videoUrl && window.openTamyizVideoModal) {
          window.openTamyizVideoModal({
            title: `${p.name} — Preview Video`,
            videoUrl: p.videoUrl,
            category: 'Book Preview',
            book: { id: p.id, name: p.name, slug: p.slug, price: p.price, coverThumb: p.coverUrl }
          });
        }
      });
    });

    mount.querySelectorAll('.tmz-delete-book-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`Delete "${name}"? This permanently removes the e-book, its cover and download file. Existing customer links will be deactivated.`)) return;

        const res = await this.api(`products/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          alert(res.data.error || 'Failed to delete e-book.');
          return;
        }
        markCatalogUpdated();
        this.app?.refreshProducts?.({ fresh: true });
        this.renderProductsTab(mount);
      });
    });
  }

  openProductForm(b) {
    this.editingProduct = b;
    this.coverBlob = null;
    this.thumbBlob = null;

    const listV = document.getElementById('tmz-product-list-view');
    const formV = document.getElementById('tmz-product-form-view');
    if (!listV || !formV) return;

    listV.style.display = 'none';
    formV.style.display = 'block';

    formV.innerHTML = `
      <div class="tmz-admin-section-head">
        <div>
          <p class="tmz-label">MONOGRAPH SPECIFICATION</p>
          <h2 class="tmz-admin-section-title">${b ? 'Edit E-Book' : 'Publish New E-Book'}</h2>
        </div>
        <button id="tmz-cancel-form" type="button" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">
          ← Back to Catalog
        </button>
      </div>

      <form id="tmz-book-form" novalidate>
        <div class="tmz-admin-field">
          <label for="tmz-f-name" class="tmz-admin-field-label">Title *</label>
          <input type="text" id="tmz-f-name" class="tmz-admin-input" required maxlength="140" value="${b ? escapeText(b.name) : ''}" placeholder="e.g. The Prompt Engineer's Playbook" />
        </div>

        <div class="tmz-admin-field">
          <label for="tmz-f-tagline" class="tmz-admin-field-label">One-Line Summary</label>
          <input type="text" id="tmz-f-tagline" class="tmz-admin-input" maxlength="200" value="${b ? escapeText(b.tagline || '') : ''}" placeholder="Short compelling description shown on cards and headers" />
        </div>

        <div class="tmz-admin-form-grid-2 tmz-admin-field">
          <div>
            <label for="tmz-f-price" class="tmz-admin-field-label">Price in ₹ *</label>
            <input type="number" id="tmz-f-price" class="tmz-admin-input" required min="1" max="100000" step="1" value="${b ? b.price : ''}" placeholder="499" />
          </div>
          <div>
            <label for="tmz-f-pages" class="tmz-admin-field-label">Pages (Optional)</label>
            <input type="number" id="tmz-f-pages" class="tmz-admin-input" min="1" max="5000" step="1" value="${b && b.pages ? b.pages : ''}" placeholder="128" />
          </div>
        </div>

        <div class="tmz-admin-field">
          <label for="tmz-f-desc" class="tmz-admin-field-label">Full Description</label>
          <textarea id="tmz-f-desc" class="tmz-admin-input tmz-admin-textarea" rows="4">${b ? escapeText(b.description || '') : ''}</textarea>
        </div>

        <div class="tmz-admin-field">
          <label for="tmz-f-contents" class="tmz-admin-field-label">Chapters &amp; Syllabus (One Per Line)</label>
          <textarea id="tmz-f-contents" class="tmz-admin-input tmz-admin-textarea" rows="3">${b && b.contents ? b.contents.join('\n') : ''}</textarea>
        </div>

        <div class="tmz-admin-subbox">
          <p class="tmz-label" style="margin-bottom: 6px;">CHAPTER 1 LEAD MAGNET</p>
          <label class="tmz-admin-field-label" style="margin-bottom: 2px;">Free Sample Excerpt</label>
          <p class="tmz-admin-field-hint" style="margin: 0 0 12px;">Storefront visitors can read this Chapter 1 preview immediately after entering their email.</p>
          <div class="tmz-admin-form-grid-2" style="margin-bottom: 12px;">
            <div>
              <label for="tmz-f-sample-chapter" class="tmz-admin-field-label">Chapter Label</label>
              <input type="text" id="tmz-f-sample-chapter" class="tmz-admin-input" maxlength="100" value="${b && b.sampleExcerpt && b.sampleExcerpt.chapter ? escapeText(b.sampleExcerpt.chapter) : 'Chapter 01'}" placeholder="Chapter 01" />
            </div>
            <div>
              <label for="tmz-f-sample-subtitle" class="tmz-admin-field-label">Chapter Subtitle</label>
              <input type="text" id="tmz-f-sample-subtitle" class="tmz-admin-input" maxlength="150" value="${b && b.sampleExcerpt && b.sampleExcerpt.subtitle ? escapeText(b.sampleExcerpt.subtitle) : ''}" placeholder="Foundations & Principles" />
            </div>
          </div>
          <div>
            <label for="tmz-f-sample-text" class="tmz-admin-field-label">Chapter 1 Text</label>
            <textarea id="tmz-f-sample-text" class="tmz-admin-input tmz-admin-textarea" rows="4" placeholder="Paste the introductory chapter or excerpt text here...">${b && b.sampleExcerpt && b.sampleExcerpt.text ? escapeText(b.sampleExcerpt.text) : ''}</textarea>
          </div>
        </div>

        <div class="tmz-admin-subbox">
          <div class="tmz-admin-panel-head" style="margin-bottom: 4px;">
            <label for="tmz-f-video" class="tmz-admin-field-label" style="margin: 0;">Book Preview / Trailer Video (Optional)</label>
            <button type="button" id="tmz-test-book-video-btn" class="tmz-admin-btn tmz-admin-btn-yellow tmz-admin-btn-sm">
              ▶ Test Video
            </button>
          </div>
          <p class="tmz-admin-field-hint" style="margin: 0 0 10px;">Attach a video preview, teaser, or walkthrough of this book for buyers on the edition page.</p>
          <input type="url" id="tmz-f-video" class="tmz-admin-input" placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/... or https://.../video.mp4" value="${b && b.videoUrl ? escapeText(b.videoUrl) : ''}" />
          <span class="tmz-admin-field-hint">Supports YouTube (privacy mode), Vimeo, and direct HTTPS MP4 files.</span>
        </div>

        <div class="tmz-admin-form-grid-2" style="margin-bottom: 20px;">
          <div class="tmz-admin-dropzone">
            <label for="tmz-f-cover" class="tmz-admin-field-label">Cover Image (Portrait 2:3 JPG/PNG/WebP)</label>
            <input type="file" id="tmz-f-cover" accept="image/jpeg,image/png,image/webp" style="margin-bottom: 8px; font-size: 13px; width: 100%;" />
            <div id="tmz-cover-preview" style="margin-top: 8px; ${b && b.coverUrl ? '' : 'display: none;'}">
              <img id="tmz-cover-img" src="${b && b.coverUrl ? b.coverUrl : ''}" style="width: 60px; height: 90px; object-fit: cover; border-radius: 3px; border: 1px solid rgba(0,0,0,0.16);" />
              <span id="tmz-cover-note" class="tmz-admin-field-hint">${b && b.coverUrl ? 'Current active cover' : ''}</span>
            </div>
          </div>

          <div class="tmz-admin-dropzone">
            <label for="tmz-f-pdf" class="tmz-admin-field-label">Deliverable E-Book PDF (Up to 25 MB)</label>
            <input type="file" id="tmz-f-pdf" accept="application/pdf,.pdf" style="margin-bottom: 8px; font-size: 13px; width: 100%;" />
            <span id="tmz-pdf-note" class="tmz-admin-field-hint">
              ${b && b.fileSize ? `Current PDF: ${b.fileName || 'ebook.pdf'} (${mb(b.fileSize)})` : 'No PDF uploaded yet.'}
            </span>
          </div>
        </div>

        <div class="tmz-admin-field" style="margin-bottom: 22px;">
          <span class="tmz-admin-field-label" style="margin-bottom: 8px;">Storefront Availability</span>
          <div class="tmz-admin-radio-grid">
            <label class="tmz-admin-radio-card">
              <input type="radio" name="tmz_status" value="draft" ${!b || b.status === 'draft' ? 'checked' : ''} />
              <div>
                <strong style="display: block; font-size: 14px; font-family: var(--font-head);">Draft</strong>
                <span style="font-size: 12px; color: var(--tmz-graphite, #55554F);">Hidden from storefront</span>
              </div>
            </label>
            <label class="tmz-admin-radio-card">
              <input type="radio" name="tmz_status" value="soon" ${b && b.status === 'soon' ? 'checked' : ''} />
              <div>
                <strong style="display: block; font-size: 14px; font-family: var(--font-head);">Coming Soon</strong>
                <span style="font-size: 12px; color: var(--tmz-graphite, #55554F);">WhatsApp pre-orders</span>
              </div>
            </label>
            <label class="tmz-admin-radio-card">
              <input type="radio" name="tmz_status" value="on-sale" ${b && b.status === 'on-sale' ? 'checked' : ''} />
              <div>
                <strong style="display: block; font-size: 14px; font-family: var(--font-head);">On Sale</strong>
                <span style="font-size: 12px; color: var(--tmz-graphite, #55554F);">Instant digital checkout</span>
              </div>
            </label>
          </div>
        </div>

        <div id="tmz-form-msg" class="tmz-admin-msg"></div>
        <progress id="tmz-progress" max="100" value="0" style="display: none; width: 100%; height: 6px; margin-bottom: 14px; accent-color: #0B0B0B;"></progress>

        <div class="tmz-admin-actions-row">
          <button type="submit" id="tmz-save-btn" class="tmz-admin-btn tmz-admin-btn-primary">
            Save E-Book
          </button>
          <button type="button" id="tmz-form-cancel-btn" class="tmz-admin-btn tmz-admin-btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    `;

    document.getElementById('tmz-cancel-form').addEventListener('click', () => {
      formV.style.display = 'none';
      listV.style.display = 'block';
    });
    document.getElementById('tmz-form-cancel-btn').addEventListener('click', () => {
      formV.style.display = 'none';
      listV.style.display = 'block';
    });

    const coverInput = document.getElementById('tmz-f-cover');
    coverInput.addEventListener('change', async () => {
      const file = coverInput.files[0];
      if (!file) return;
      try {
        const raw = await createImageBitmap(file);
        let bmp = raw;
        for (let i = 0; i < 3; i++) { const next = await trimBorder(bmp); if (next === bmp) break; bmp = next; }
        const trimmed = bmp !== raw;
        const { blob: bigBlob, canvas } = await this.shrinkBitmap(bmp, 1200, 0.86);
        const { blob: smBlob } = await this.shrinkBitmap(bmp, 720, 0.8);
        this.coverBlob = bigBlob;
        this.thumbBlob = smBlob;

        const prev = document.getElementById('tmz-cover-preview');
        const img = document.getElementById('tmz-cover-img');
        const note = document.getElementById('tmz-cover-note');
        img.src = URL.createObjectURL(this.coverBlob);
        note.textContent = `New cover ready (${canvas.width}×${canvas.height}, ${Math.round(this.coverBlob.size / 1024)} KB)${trimmed ? ' — white border trimmed' : ''}`;
        prev.style.display = 'block';
      } catch {
        alert('Could not process that image file. Please choose a valid JPG, PNG or WebP.');
      }
    });

    const pdfInput = document.getElementById('tmz-f-pdf');
    pdfInput.addEventListener('change', () => {
      const file = pdfInput.files[0];
      if (!file) return;
      if (file.size > MAX_PDF_BYTES) {
        alert(`PDF file is ${mb(file.size)}. Maximum upload limit is 25 MB.`);
        pdfInput.value = '';
        return;
      }
      document.getElementById('tmz-pdf-note').textContent = `Ready to upload: ${file.name} (${mb(file.size)})`;
    });

    const testVideoBtn = document.getElementById('tmz-test-book-video-btn');
    if (testVideoBtn) {
      testVideoBtn.addEventListener('click', () => {
        const vUrl = document.getElementById('tmz-f-video')?.value.trim();
        if (!vUrl) {
          alert('Please enter a YouTube, Vimeo, or direct MP4 URL first.');
          return;
        }
        if (window.openTamyizVideoModal) {
          window.openTamyizVideoModal({
            title: `${document.getElementById('tmz-f-name')?.value.trim() || (b && b.name) || 'Book'} — Preview`,
            videoUrl: vUrl,
            category: 'Book Preview',
            book: b ? { id: b.id, name: b.name, slug: b.slug, price: b.price, coverThumb: b.coverUrl } : null
          });
        }
      });
    }

    document.getElementById('tmz-book-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = document.getElementById('tmz-form-msg');
      const name = document.getElementById('tmz-f-name').value.trim();
      const price = Number(document.getElementById('tmz-f-price').value);
      const status = document.querySelector('input[name="tmz_status"]:checked').value;
      const pdfFile = pdfInput.files[0];

      if (name.length < 3) {
        msg.style.color = '#B3261E';
        msg.textContent = 'Please provide an e-book title (at least 3 characters).';
        return;
      }
      if (!Number.isInteger(price) || price < 1) {
        msg.style.color = '#B3261E';
        msg.textContent = 'Price must be a valid whole number in Rupees.';
        return;
      }
      if (status === 'on-sale' && !pdfFile && (!b || !b.fileSize)) {
        msg.style.color = '#B3261E';
        msg.textContent = 'An e-book requires a PDF before it can be marked "On sale".';
        return;
      }

      const formData = new FormData();
      formData.append('name', name);
      formData.append('tagline', document.getElementById('tmz-f-tagline').value);
      formData.append('price', String(price));
      formData.append('pages', document.getElementById('tmz-f-pages').value);
      formData.append('description', document.getElementById('tmz-f-desc').value);
      formData.append('contents', document.getElementById('tmz-f-contents').value);
      formData.append('status', status);

      const videoVal = document.getElementById('tmz-f-video')?.value.trim();
      formData.append('videoUrl', videoVal || '');

      const sampleText = document.getElementById('tmz-f-sample-text')?.value.trim();
      const sampleChap = document.getElementById('tmz-f-sample-chapter')?.value.trim();
      const sampleSub = document.getElementById('tmz-f-sample-subtitle')?.value.trim();
      if (sampleText) {
        formData.append('sample', sampleText);
        formData.append('sampleChapter', sampleChap || 'Chapter 01');
        formData.append('sampleSubtitle', sampleSub || '');
      }

      if (this.coverBlob) formData.append('cover', this.coverBlob, 'cover.jpg');
      if (this.coverBlob && this.thumbBlob) formData.append('thumb', this.thumbBlob, 'thumb.jpg');
      if (pdfFile) formData.append('pdf', pdfFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', b ? `/api/admin/products/${b.id}` : '/api/admin/products');
      xhr.setRequestHeader('X-Tamyiz-Admin', '1');

      const pBar = document.getElementById('tmz-progress');
      const saveBtn = document.getElementById('tmz-save-btn');
      pBar.style.display = 'block';
      pBar.value = 0;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving E-Book…';

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) pBar.value = Math.round((ev.loaded / ev.total) * 100);
      };

      xhr.onloadend = () => {
        pBar.style.display = 'none';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save E-Book';

        let res = {};
        try { res = JSON.parse(xhr.responseText); } catch {}

        if (xhr.status === 401) return this.renderLoginView();
        if (xhr.status < 200 || xhr.status >= 300) {
          msg.style.color = '#B3261E';
          msg.textContent = res.error || 'Failed to save e-book.';
          return;
        }

        formV.style.display = 'none';
        markCatalogUpdated();
        this.app?.refreshProducts?.({ fresh: true });
        this.renderProductsTab(document.getElementById('tmz-admin-tab-body'));
      };

      xhr.send(formData);
    });
  }

  async shrinkBitmap(bmp, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return { blob, canvas };
  }

  // ---------------------------------------------------------------- FILMS & VIDEO SHOWCASE TAB
  async renderFilmsTab(mount) {
    if (!this.products.length) {
      const pRes = await this.api('products');
      this.products = pRes.ok && Array.isArray(pRes.data?.products) ? pRes.data.products : [];
    }

    const res = await this.api('films');
    this.films = res.ok && Array.isArray(res.data?.videos) ? res.data.videos : [];

    const totalFilms = this.films.length;
    const publishedCount = this.films.filter(f => f.published).length;
    const featuredCount = this.films.filter(f => f.featured).length;
    const homepageCount = this.films.filter(f => f.homepageVisible).length;

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">CINEMA // YOUTUBE SHOWCASE</p>
            <h2 class="tmz-admin-section-title">Films &amp; Video Showcase</h2>
            <p class="tmz-admin-section-sub">Manage motion graphics, trailers, and visual essays published on /films and the homepage.</p>
          </div>
          <div class="tmz-admin-actions-row">
            <a href="/films" target="_blank" rel="noopener noreferrer" class="tmz-admin-btn tmz-admin-btn-secondary">
              View Showcase ↗
            </a>
            <button id="tmz-add-film-btn" type="button" class="tmz-admin-btn tmz-admin-btn-primary">
              + Add New Film
            </button>
          </div>
        </div>

        <!-- KPI Mini Stats -->
        <div class="tmz-admin-kpi-grid">
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>01 // Total Films</span></div>
            <b class="tmz-admin-kpi-val">${totalFilms}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>02 // Published</span></div>
            <b class="tmz-admin-kpi-val tmz-admin-kpi-val--ok">${publishedCount}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>03 // Featured</span></div>
            <b class="tmz-admin-kpi-val">${featuredCount}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>04 // Homepage Visible</span></div>
            <b class="tmz-admin-kpi-val">${homepageCount}</b>
          </div>
        </div>

        <!-- Film Editor Drawer/Box -->
        <div id="tmz-film-form-box" class="tmz-admin-panel tmz-frame" style="display: ${this.editingFilm ? 'block' : 'none'}; margin-bottom: 24px;">
          <div class="tmz-admin-section-head" style="margin-bottom: 18px;">
            <div>
              <p class="tmz-label">FILM SPECIFICATION</p>
              <h3 class="tmz-admin-panel-title">
                ${this.editingFilm?.id ? `Edit Film: ${escapeText(this.editingFilm.title)}` : 'Add New Film'}
              </h3>
            </div>
            <button type="button" id="tmz-cancel-film-top" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">✕ Close</button>
          </div>

          <form id="tmz-film-form">
            <div class="tmz-admin-form-grid-2 tmz-admin-field">
              <div>
                <label for="tmz-film-title" class="tmz-admin-field-label">Film Title *</label>
                <input type="text" id="tmz-film-title" class="tmz-admin-input" required maxlength="140" placeholder="e.g. The Architecture of Distinction" value="${escapeText(this.editingFilm?.title || '')}" />
              </div>

              <div>
                <label for="tmz-film-url" class="tmz-admin-field-label">Video URL (YouTube, Vimeo, or MP4) *</label>
                <input type="url" id="tmz-film-url" class="tmz-admin-input" required placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..." value="${escapeText(this.editingFilm?.videoUrl || '')}" />
                <span class="tmz-admin-field-hint">Supports YouTube (privacy mode), Vimeo, or direct HTTPS MP4 stream.</span>
              </div>
            </div>

            <div class="tmz-admin-form-grid-auto tmz-admin-field">
              <div>
                <label for="tmz-film-cat" class="tmz-admin-field-label">Category</label>
                <input type="text" list="tmz-cat-presets" id="tmz-film-cat" class="tmz-admin-input" placeholder="Book Trailers" value="${escapeText(this.editingFilm?.category || 'Book Trailers')}" />
                <datalist id="tmz-cat-presets">
                  <option value="Book Trailers"></option>
                  <option value="Motion Graphics"></option>
                  <option value="Ideas &amp; Concepts"></option>
                  <option value="Educational Films"></option>
                  <option value="Brand Stories"></option>
                </datalist>
              </div>

              <div>
                <label for="tmz-film-product" class="tmz-admin-field-label">Associated Publication</label>
                <select id="tmz-film-product" class="tmz-admin-input">
                  <option value="">None (Independent Brand Film)</option>
                  ${this.products.map(p => `
                    <option value="${escapeText(p.id)}" ${(this.editingFilm?.productId === p.id) ? 'selected' : ''}>
                      ${escapeText(p.name)} (₹${escapeText(p.price)})
                    </option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label for="tmz-film-dur" class="tmz-admin-field-label">Duration (e.g. 02:45)</label>
                <input type="text" id="tmz-film-dur" class="tmz-admin-input" maxlength="20" placeholder="02:30" value="${escapeText(this.editingFilm?.duration || '')}" />
              </div>

              <div>
                <label for="tmz-film-thumb" class="tmz-admin-field-label">Custom Thumbnail URL</label>
                <input type="url" id="tmz-film-thumb" class="tmz-admin-input" placeholder="https://... (Auto YouTube if empty)" value="${escapeText(this.editingFilm?.thumbnailUrl || '')}" />
              </div>
            </div>

            <div class="tmz-admin-field">
              <label for="tmz-film-desc" class="tmz-admin-field-label">Short Description</label>
              <textarea id="tmz-film-desc" class="tmz-admin-input tmz-admin-textarea" rows="3" maxlength="1000" placeholder="Brief visual summary of this film...">${escapeText(this.editingFilm?.description || '')}</textarea>
            </div>

            <!-- Status Checkboxes -->
            <div class="tmz-admin-check-row">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                <input type="checkbox" id="tmz-film-published" ${this.editingFilm?.published ? 'checked' : (!this.editingFilm ? 'checked' : '')} />
                <span>Published (Live in collection)</span>
              </label>

              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                <input type="checkbox" id="tmz-film-featured" ${this.editingFilm?.featured ? 'checked' : ''} />
                <span>Featured Film (Hero slot)</span>
              </label>

              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">
                <input type="checkbox" id="tmz-film-homepage" ${this.editingFilm?.homepageVisible !== false ? 'checked' : ''} />
                <span>Show on Homepage</span>
              </label>

              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600;">
                <label for="tmz-film-order">Display Order:</label>
                <input type="number" id="tmz-film-order" class="tmz-admin-input" min="0" max="999" value="${this.editingFilm?.displayOrder || 1}" style="width: 72px; padding: 5px 8px;" />
              </div>
            </div>

            <div id="tmz-film-msg" class="tmz-admin-msg" style="display: none; padding: 10px 14px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15);"></div>

            <div class="tmz-admin-actions-row">
              <button type="submit" id="tmz-save-film-btn" class="tmz-admin-btn tmz-admin-btn-primary">
                ${this.editingFilm?.id ? 'Update Film' : 'Publish Film'}
              </button>
              <button type="button" id="tmz-preview-film-form-btn" class="tmz-admin-btn tmz-admin-btn-yellow">
                ▶ Preview Player
              </button>
              <button type="button" id="tmz-cancel-film-btn" class="tmz-admin-btn tmz-admin-btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>

        <!-- Video Collection Grid/Table -->
        ${!this.films.length ? `
          <div class="tmz-admin-empty">
            <h3>No films published yet</h3>
            <p>Create your first film trailer, motion graphic, or concept visual for TAMYIZ.</p>
            <button type="button" id="tmz-add-first-film-btn" class="tmz-admin-btn tmz-admin-btn-primary">
              + Add First Film
            </button>
          </div>
        ` : `
          <div class="tmz-admin-table-wrap">
            <div class="tmz-admin-table-scroll">
              <table class="tmz-admin-table">
                <thead>
                  <tr>
                    <th style="width: 136px;">Preview</th>
                    <th>Film Title &amp; Details</th>
                    <th>Category</th>
                    <th>Associated Publication</th>
                    <th>Status</th>
                    <th style="text-align: right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.films.map(f => {
                    const thumb = f.thumbnailUrl || (f.provider === 'youtube' && f.videoId ? `https://img.youtube.com/vi/${f.videoId}/hqdefault.jpg` : '/og/tamyiz.jpg');
                    return `
                      <tr>
                        <td style="vertical-align: top;">
                          <div style="width: 120px; aspect-ratio: 16/9; background: #0B0B0B; border-radius: 3px; border: 1px solid rgba(0,0,0,0.14); overflow: hidden; position: relative;">
                            <img src="${escapeText(thumb)}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />
                            ${f.duration ? `
                              <span style="position: absolute; bottom: 4px; right: 4px; background: var(--tmz-yellow, #FFD60A); color: #0B0B0B; border: 1px solid rgba(11,11,11,0.3); font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 2px; font-family: monospace;">
                                ${escapeText(f.duration)}
                              </span>
                            ` : ''}
                          </div>
                        </td>
                        <td style="vertical-align: top;">
                          <div style="font-family: var(--font-head); font-weight: 600; color: #0B0B0B; font-size: 15px; margin-bottom: 4px;">
                            ${escapeText(f.title)}
                          </div>
                          <div style="font-size: 12.5px; color: var(--tmz-graphite, #55554F); margin-bottom: 6px; max-width: 360px;">
                            ${escapeText(f.description || 'No description.')}
                          </div>
                          <div style="display: flex; gap: 6px; align-items: center; font-size: 11px;">
                            <span class="tmz-admin-status tmz-admin-status--muted">${escapeText(f.provider || 'video')}</span>
                            <span style="color: var(--tmz-graphite, #55554F);">Order #${f.displayOrder || 1}</span>
                          </div>
                        </td>
                        <td style="vertical-align: top;">
                          <span class="tmz-admin-status tmz-admin-status--muted">
                            ${escapeText(f.category || 'General')}
                          </span>
                        </td>
                        <td style="vertical-align: top;">
                          ${f.bookName ? `
                            <div style="font-weight: 600; color: #0B0B0B; font-size: 13px;">${escapeText(f.bookName)}</div>
                            <span style="font-size: 11px; color: var(--tmz-graphite, #55554F); font-family: monospace;">${escapeText(f.productId)}</span>
                          ` : `
                            <span style="color: var(--tmz-graphite, #55554F); font-size: 13px;">Independent Film</span>
                          `}
                        </td>
                        <td style="vertical-align: top;">
                          <div style="display: flex; flex-direction: column; gap: 4px;">
                            <span class="tmz-admin-status ${f.published ? 'tmz-admin-status--live' : 'tmz-admin-status--muted'}">
                              <span class="tmz-admin-dot"></span> ${f.published ? 'Published' : 'Draft'}
                            </span>
                            ${f.featured ? `
                              <span class="tmz-admin-status tmz-admin-status--warn">Featured</span>
                            ` : ''}
                            ${f.homepageVisible ? `
                              <span class="tmz-admin-status tmz-admin-status--info">Homepage</span>
                            ` : ''}
                          </div>
                        </td>
                        <td style="vertical-align: top; text-align: right;">
                          <div class="tmz-admin-actions-row" style="justify-content: flex-end;">
                            <button type="button" class="tmz-preview-film-row-btn tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm" data-id="${escapeText(f.id)}">
                              Preview
                            </button>
                            <button type="button" class="tmz-edit-film-row-btn tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm" data-id="${escapeText(f.id)}">
                              Edit
                            </button>
                            <button type="button" class="tmz-toggle-pub-row-btn tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm" data-id="${escapeText(f.id)}" data-pub="${f.published ? '1' : '0'}">
                              ${f.published ? 'Unpublish' : 'Publish'}
                            </button>
                            <button type="button" class="tmz-del-film-row-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-id="${escapeText(f.id)}" data-title="${escapeText(f.title)}">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;

    this.bindFilmsTabEvents(mount);
  }

  bindFilmsTabEvents(mount) {
    const addBtn = document.getElementById('tmz-add-film-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.editingFilm = {};
        this.renderFilmsTab(mount);
        const formBox = document.getElementById('tmz-film-form-box');
        if (formBox) formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    const addFirstBtn = document.getElementById('tmz-add-first-film-btn');
    if (addFirstBtn) {
      addFirstBtn.addEventListener('click', () => {
        this.editingFilm = {};
        this.renderFilmsTab(mount);
        const formBox = document.getElementById('tmz-film-form-box');
        if (formBox) formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    const cancelTop = document.getElementById('tmz-cancel-film-top');
    if (cancelTop) {
      cancelTop.addEventListener('click', () => {
        this.editingFilm = null;
        this.renderFilmsTab(mount);
      });
    }

    const cancelBtn = document.getElementById('tmz-cancel-film-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.editingFilm = null;
        this.renderFilmsTab(mount);
      });
    }

    // Row preview button
    mount.querySelectorAll('.tmz-preview-film-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const film = this.films.find(f => f.id === id);
        if (film && window.openTamyizVideoModal) {
          window.openTamyizVideoModal(film);
        }
      });
    });

    // Row edit button
    mount.querySelectorAll('.tmz-edit-film-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const film = this.films.find(f => f.id === id);
        if (film) {
          this.editingFilm = { ...film };
          this.renderFilmsTab(mount);
          const formBox = document.getElementById('tmz-film-form-box');
          if (formBox) formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    // Row toggle publish button
    mount.querySelectorAll('.tmz-toggle-pub-row-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const film = this.films.find(f => f.id === id);
        if (!film) return;
        const newPub = !film.published;
        btn.disabled = true;
        btn.textContent = 'Updating…';
        const res = await this.api(`films/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...film, published: newPub })
        });
        if (res.ok) {
          this.renderFilmsTab(mount);
        } else {
          alert(res.data?.error || 'Failed to update film status.');
          btn.disabled = false;
        }
      });
    });

    // Row delete button
    mount.querySelectorAll('.tmz-del-film-row-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const title = btn.dataset.title;
        if (!confirm(`Are you sure you want to delete the film "${title}"? This cannot be undone.`)) return;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        const res = await this.api(`films/${id}`, { method: 'DELETE' });
        if (res.ok) {
          this.renderFilmsTab(mount);
        } else {
          alert(res.data?.error || 'Failed to delete film.');
          btn.disabled = false;
        }
      });
    });

    // Preview button inside form
    const formPreviewBtn = document.getElementById('tmz-preview-film-form-btn');
    if (formPreviewBtn) {
      formPreviewBtn.addEventListener('click', () => {
        const title = document.getElementById('tmz-film-title')?.value || 'Preview Film';
        const videoUrl = document.getElementById('tmz-film-url')?.value;
        const category = document.getElementById('tmz-film-cat')?.value || 'Film';
        const duration = document.getElementById('tmz-film-dur')?.value;
        const description = document.getElementById('tmz-film-desc')?.value;
        const prodId = document.getElementById('tmz-film-product')?.value;
        const book = prodId ? this.products.find(p => p.id === prodId) : null;

        if (!videoUrl) {
          alert('Please enter a video URL to preview.');
          return;
        }

        let provider = 'mp4';
        let videoId = null;
        let embedUrl = videoUrl;
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
          provider = 'youtube';
          if (videoUrl.includes('youtu.be/')) videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0];
          else if (videoUrl.includes('v=')) videoId = new URL(videoUrl).searchParams.get('v');
          embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
        } else if (videoUrl.includes('vimeo.com')) {
          provider = 'vimeo';
          const parts = videoUrl.split('/').filter(Boolean);
          videoId = parts[parts.length - 1];
          embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1`;
        }

        const previewData = {
          title,
          videoUrl,
          provider,
          videoId,
          embedUrl,
          category,
          duration,
          description,
          book: book ? { id: book.id, name: book.name, slug: book.slug, price: book.price } : null
        };

        if (window.openTamyizVideoModal) window.openTamyizVideoModal(previewData);
      });
    }

    // Submit form
    const form = document.getElementById('tmz-film-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('tmz-film-msg');
        const submitBtn = document.getElementById('tmz-save-film-btn');

        const title = document.getElementById('tmz-film-title').value.trim();
        const videoUrl = document.getElementById('tmz-film-url').value.trim();
        const category = document.getElementById('tmz-film-cat').value.trim() || 'General';
        const productId = document.getElementById('tmz-film-product').value || null;
        const duration = document.getElementById('tmz-film-dur').value.trim();
        const thumbnailUrl = document.getElementById('tmz-film-thumb').value.trim();
        const description = document.getElementById('tmz-film-desc').value.trim();
        const published = document.getElementById('tmz-film-published').checked;
        const featured = document.getElementById('tmz-film-featured').checked;
        const homepageVisible = document.getElementById('tmz-film-homepage').checked;
        const displayOrder = Number(document.getElementById('tmz-film-order').value) || 1;

        if (msg) {
          msg.style.display = 'block';
          msg.style.background = '#E0F2FE';
          msg.style.color = '#0369A1';
          msg.textContent = 'Saving film…';
        }
        submitBtn.disabled = true;

        const payload = {
          title,
          videoUrl,
          category,
          productId,
          duration,
          thumbnailUrl,
          description,
          published,
          featured,
          homepageVisible,
          displayOrder
        };

        const isEdit = Boolean(this.editingFilm?.id);
        const endpoint = isEdit ? `films/${this.editingFilm.id}` : 'films';

        const res = await this.api(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          this.editingFilm = null;
          this.renderFilmsTab(mount);
        } else {
          if (msg) {
            msg.style.display = 'block';
            msg.style.background = '#FEE2E2';
            msg.style.color = '#B91C1C';
            msg.textContent = res.data?.error || 'Failed to save film. Please check fields.';
          }
          submitBtn.disabled = false;
        }
      });
    }
  }

  // ---------------------------------------------------------------- ORDERS TAB
  async renderOrdersTab(mount) {
    if (!this.products.length) {
      const pRes = await this.api('products');
      this.products = pRes.ok ? (pRes.data.products || []) : [];
    }
    const query = this.orderSearchQuery.trim();
    const res = await this.api(`orders${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    this.orders = res.ok ? (res.data.orders || []) : [];

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">FULFILLMENT // LEDGER</p>
            <h2 class="tmz-admin-section-title">Orders &amp; Fulfillments</h2>
            <p class="tmz-admin-section-sub">Customer transactions, complimentary gift orders, and digital download links.</p>
          </div>
          <div class="tmz-admin-search-group">
            <button id="tmz-btn-open-gift" type="button" class="tmz-admin-btn tmz-admin-btn-yellow tmz-admin-btn-sm">
              + Send Gift Copy
            </button>
            <input type="text" id="tmz-order-search" class="tmz-admin-input tmz-admin-search-input" placeholder="Search ref, email, phone…" value="${escapeText(this.orderSearchQuery)}" />
            <button id="tmz-order-search-btn" type="button" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">Search</button>
          </div>
        </div>

        <!-- Gift Order Modal -->
        <div id="tmz-gift-modal" class="tmz-admin-panel tmz-frame" style="display: none; margin-bottom: 24px;">
          <div class="tmz-admin-section-head" style="margin-bottom: 16px;">
            <div>
              <p class="tmz-label">COMPLIMENTARY DISPATCH</p>
              <h3 class="tmz-admin-panel-title">Send Free Gift / Review Copy</h3>
            </div>
            <button id="tmz-close-gift-modal" type="button" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">✕ Close</button>
          </div>
          <form id="tmz-gift-form">
            <div class="tmz-admin-form-grid-auto tmz-admin-field">
              <div>
                <label for="tmz-gift-email" class="tmz-admin-field-label">Recipient Email *</label>
                <input type="email" id="tmz-gift-email" class="tmz-admin-input" required placeholder="reviewer@example.com" />
              </div>
              <div>
                <label for="tmz-gift-phone" class="tmz-admin-field-label">Phone (Optional)</label>
                <input type="tel" id="tmz-gift-phone" class="tmz-admin-input" placeholder="9876543210" />
              </div>
              <div>
                <label for="tmz-gift-product" class="tmz-admin-field-label">E-Book Edition *</label>
                <select id="tmz-gift-product" class="tmz-admin-input" required>
                  ${this.products.map((p) => `<option value="${p.id}">${escapeText(p.name)} (₹${p.price})</option>`).join('')}
                </select>
              </div>
            </div>
            <div id="tmz-gift-result" class="tmz-admin-msg"></div>
            <button type="submit" id="tmz-gift-submit-btn" class="tmz-admin-btn tmz-admin-btn-primary">
              Generate &amp; Dispatch Gift Order
            </button>
          </form>
        </div>

        ${this.orders.length ? `
          <div class="tmz-admin-table-wrap">
            <div class="tmz-admin-table-scroll">
              <table class="tmz-admin-table">
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Customer</th>
                    <th>Items Purchased</th>
                    <th>Total</th>
                    <th style="text-align: right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.orders.map((o) => `
                    <tr>
                      <td style="font-family: var(--font-head); font-weight: 600;">
                        <div>${escapeText(o.referenceId || o.orderId)}</div>
                        ${o.paymentId ? `<span style="display: block; font-size: 11px; color: var(--tmz-graphite, #55554F); font-weight: 400; font-family: monospace;">${escapeText(o.paymentId)}</span>` : ''}
                        <span style="font-size: 11px; color: var(--tmz-graphite, #55554F); font-weight: 400;">${o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                      </td>
                      <td>
                        <div style="font-weight: 600; color: #0B0B0B;">${escapeText(o.email || '—')}</div>
                        ${o.phone ? `<div style="font-size: 12px; color: var(--tmz-graphite, #55554F);">${escapeText(o.phone)}</div>` : ''}
                      </td>
                      <td>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                          ${(o.items || []).map((i) => `<span class="tmz-admin-status tmz-admin-status--muted">${escapeText(i.name)}</span>`).join('')}
                        </div>
                      </td>
                      <td style="font-family: var(--font-head); font-weight: 700;">
                        ₹${o.totalINR || Math.round((o.amountPaise || 0) / 100)}
                      </td>
                      <td style="text-align: right; white-space: nowrap;">
                        <button type="button" class="tmz-resend-btn tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm" data-id="${o.orderId}">
                          Re-send Email ✉
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="tmz-admin-empty">
            <p>${query ? `No customer orders match "${escapeText(query)}".` : 'No orders recorded yet. As customers buy on the storefront, all transactions appear here.'}</p>
          </div>
        `}
      </div>
    `;

    document.getElementById('tmz-btn-open-gift')?.addEventListener('click', () => {
      document.getElementById('tmz-gift-modal').style.display = 'block';
    });
    document.getElementById('tmz-close-gift-modal')?.addEventListener('click', () => {
      document.getElementById('tmz-gift-modal').style.display = 'none';
    });

    document.getElementById('tmz-gift-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('tmz-gift-email').value.trim();
      const phone = document.getElementById('tmz-gift-phone').value.trim();
      const productId = document.getElementById('tmz-gift-product').value;
      const resBox = document.getElementById('tmz-gift-result');
      const submitBtn = document.getElementById('tmz-gift-submit-btn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating…';
      resBox.innerHTML = '';

      const res = await this.api('orders/gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, productId })
      });

      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate & Dispatch Gift Order';

      if (!res.ok) {
        resBox.style.color = '#B3261E';
        resBox.textContent = res.data.error || 'Failed to generate gift copy.';
        return;
      }

      resBox.style.color = '#1E7B2E';
      resBox.innerHTML = `
        Gift order created! Download URL:
        <input type="text" readonly class="tmz-admin-input" value="${res.data.downloadUrl}" style="padding: 8px 10px; font-size: 12px; font-family: monospace; margin-top: 6px;" onclick="this.select()" />
      `;
      setTimeout(() => this.renderOrdersTab(mount), 2000);
    });

    mount.querySelectorAll('.tmz-resend-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = 'Sending…';
        const res = await this.api('orders/resend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: id })
        });
        btn.disabled = false;
        if (res.ok) {
          alert('Receipt and download link re-sent to customer email.');
          btn.textContent = 'Sent ✓';
        } else {
          alert(res.data.error || 'Could not resend email.');
          btn.textContent = 'Re-send Email ✉';
        }
      });
    });

    const searchInput = document.getElementById('tmz-order-search');
    const searchBtn = document.getElementById('tmz-order-search-btn');
    const triggerSearch = () => {
      this.orderSearchQuery = searchInput.value;
      this.renderOrdersTab(mount);
    };
    searchBtn?.addEventListener('click', triggerSearch);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerSearch();
    });
  }

  // ---------------------------------------------------------------- ABANDONED CARTS TAB
  async renderAbandonedTab(mount) {
    const res = await this.api('abandoned');
    const data = res.ok ? res.data : { list: [], totalLostRevenue: 0, totalCount: 0, recoveredCount: 0 };
    const list = Array.isArray(data.list) ? data.list : [];
    const uniqueEmails = [...new Set(list.map(c => c.email))].filter(Boolean);

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">RECOVERY // CHECKOUT TELEMETRY</p>
            <h2 class="tmz-admin-section-title">Abandoned Reading Bags</h2>
            <p class="tmz-admin-section-sub">Visitors who entered their email in the checkout bag but left before completing payment.</p>
          </div>
          <div class="tmz-admin-actions-row">
            <button id="tmz-copy-abandoned-emails-btn" type="button" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">
              Copy All Emails (${uniqueEmails.length})
            </button>
            <button id="tmz-export-abandoned-btn" type="button" class="tmz-admin-btn tmz-admin-btn-primary tmz-admin-btn-sm">
              Export CSV ↓
            </button>
          </div>
        </div>

        <!-- KPI Grid -->
        <div class="tmz-admin-kpi-grid">
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>01 // Unclaimed Revenue</span></div>
            <b class="tmz-admin-kpi-val tmz-admin-kpi-val--danger">₹${(data.totalLostRevenue || 0).toLocaleString('en-IN')}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>02 // Abandoned Sessions</span></div>
            <b class="tmz-admin-kpi-val">${list.length}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>03 // Successfully Recovered</span></div>
            <b class="tmz-admin-kpi-val tmz-admin-kpi-val--ok">${data.recoveredCount || 0}</b>
          </div>
        </div>

        <!-- Table Container -->
        ${list.length === 0 ? `
          <div class="tmz-admin-empty">
            <h3>No abandoned checkouts recorded</h3>
            <p>When visitors enter their email in the bag drawer, uncompleted carts will appear here.</p>
          </div>
        ` : `
          <div class="tmz-admin-table-wrap">
            <div class="tmz-admin-table-scroll">
              <table class="tmz-admin-table">
                <thead>
                  <tr>
                    <th>Last Seen</th>
                    <th>Customer Contact</th>
                    <th>Books In Bag</th>
                    <th>Cart Value</th>
                    <th>Status</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(c => {
                    const dateStr = c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
                    const cleanPhone = (c.phone || '').replace(/[^0-9+]/g, '');
                    const waText = encodeURIComponent(`Hi! We noticed you left ${(c.items || []).map(i => i.name).join(', ')} in your TAMYIZ reading bag. Here is a 10% discount to complete your order: https://tamyiz.pages.dev/checkout?resume=${(c.items || []).map(i => i.productId).join(',')}&coupon=SAMPLE10`);
                    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}?text=${waText}` : null;
                    const isRecovered = c.status === 'recovered';

                    return `
                      <tr class="${isRecovered ? 'tmz-admin-row--recovered' : ''}">
                        <td style="color: var(--tmz-graphite, #55554F); font-size: 13px; white-space: nowrap;">${dateStr}</td>
                        <td>
                          <a href="mailto:${escapeText(c.email)}" style="font-weight: 600; color: #0B0B0B; text-decoration: none; display: block;">${escapeText(c.email)}</a>
                          ${cleanPhone ? `
                            <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #166224; text-decoration: underline; margin-top: 2px; display: inline-flex; align-items: center; gap: 4px;">
                              WhatsApp: ${escapeText(c.phone)} ↗
                            </a>
                          ` : ''}
                        </td>
                        <td style="font-size: 13px;">
                          ${(c.items || []).map(i => `<div style="font-weight: 500; color: #0B0B0B;">• ${escapeText(i.name)}</div>`).join('')}
                        </td>
                        <td style="font-weight: 700; color: #0B0B0B; white-space: nowrap;">
                          ₹${(c.total || c.subtotal || 0).toLocaleString('en-IN')}
                        </td>
                        <td style="white-space: nowrap;">
                          ${isRecovered ? `
                            <span class="tmz-admin-status tmz-admin-status--live">✓ Recovered</span>
                          ` : c.emailSent ? `
                            <span class="tmz-admin-status tmz-admin-status--info">Emailed</span>
                          ` : `
                            <span class="tmz-admin-status tmz-admin-status--warn">Abandoned</span>
                          `}
                        </td>
                        <td style="text-align: right; white-space: nowrap;">
                          <div class="tmz-admin-actions-row" style="justify-content: flex-end;">
                            ${!isRecovered ? `
                              <button type="button" class="tmz-send-abandoned-btn tmz-admin-btn tmz-admin-btn-primary tmz-admin-btn-sm" data-id="${c.id}">
                                ${c.emailSent ? 'Re-send Email' : 'Send Recovery Email'}
                              </button>
                            ` : ''}
                            <button type="button" class="tmz-del-abandoned-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-id="${c.id}">
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;

    // Copy All Emails
    document.getElementById('tmz-copy-abandoned-emails-btn')?.addEventListener('click', () => {
      if (uniqueEmails.length === 0) return alert('No emails to copy.');
      navigator.clipboard.writeText(uniqueEmails.join(', ')).then(() => {
        alert(`Copied ${uniqueEmails.length} unique emails to clipboard!`);
      });
    });

    // Export CSV
    document.getElementById('tmz-export-abandoned-btn')?.addEventListener('click', () => {
      if (list.length === 0) return alert('No abandoned carts to export.');
      const headers = ['Last Seen', 'Email', 'Phone', 'Total (INR)', 'Items', 'Status'];
      // Cells starting with = + - @ are prefixed with ' so Excel/Sheets never run them as formulas.
      const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
      const rows = list.map(c => [
        cell(c.lastSeenAt || ''),
        cell(c.email || ''),
        cell(c.phone || ''),
        cell(c.total || c.subtotal || 0),
        cell((c.items || []).map(i => i.name).join(' | ')),
        cell(c.status || 'abandoned'),
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent.slice('data:text/csv;charset=utf-8,'.length));
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `tamyiz-abandoned-carts-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // Send Recovery Email
    mount.querySelectorAll('.tmz-send-abandoned-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        btn.disabled = true;
        btn.textContent = 'Sending…';
        const res = await this.api('abandoned/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (res.ok) {
          alert('Recovery email sent with 10% discount and 1-click cart restore link!');
          this.renderAbandonedTab(mount);
        } else {
          alert(res.error || 'Failed to send recovery email');
          btn.disabled = false;
          btn.textContent = 'Send Recovery Email';
        }
      });
    });

    // Delete Abandoned Cart
    mount.querySelectorAll('.tmz-del-abandoned-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm('Remove this abandoned cart record?')) return;
        const res = await this.api(`abandoned/${id}`, { method: 'DELETE' });
        if (res.ok) {
          this.renderAbandonedTab(mount);
        } else {
          alert(res.error || 'Failed to remove record');
        }
      });
    });
  }

  // ---------------------------------------------------------------- COUPONS TAB
  async renderCouponsTab(mount) {
    const res = await this.api('coupons');
    this.coupons = res.ok ? (res.data.coupons || {}) : {};
    const couponList = Object.values(this.coupons);

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">PROMOTIONS // PRICING RULES</p>
            <h2 class="tmz-admin-section-title">Discount Coupons &amp; Promo Codes</h2>
            <p class="tmz-admin-section-sub">Create and manage promotional discount codes that work in the checkout bag.</p>
          </div>
          <button id="tmz-open-coupon-modal" type="button" class="tmz-admin-btn tmz-admin-btn-primary">
            + Create New Coupon
          </button>
        </div>

        <div id="tmz-coupon-form-box" class="tmz-admin-panel tmz-frame" style="display: none; margin-bottom: 24px;">
          <div class="tmz-admin-section-head" style="margin-bottom: 16px;">
            <div>
              <p class="tmz-label">PROMO CODE CREATOR</p>
              <h3 class="tmz-admin-panel-title">New Promotional Coupon</h3>
            </div>
            <button type="button" id="tmz-close-coupon-modal" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">✕ Cancel</button>
          </div>
          <form id="tmz-create-coupon-form">
            <div class="tmz-admin-form-grid-auto tmz-admin-field">
              <div>
                <label for="tmz-cp-code" class="tmz-admin-field-label">Coupon Code (e.g. LAUNCH20) *</label>
                <input type="text" id="tmz-cp-code" class="tmz-admin-input" required maxlength="20" placeholder="EID25" style="text-transform: uppercase;" />
              </div>
              <div>
                <label for="tmz-cp-type" class="tmz-admin-field-label">Discount Type *</label>
                <select id="tmz-cp-type" class="tmz-admin-input">
                  <option value="percent">Percentage (% off)</option>
                  <option value="flat">Flat Amount (₹ INR off)</option>
                </select>
              </div>
              <div>
                <label for="tmz-cp-val" class="tmz-admin-field-label">Discount Value *</label>
                <input type="number" id="tmz-cp-val" class="tmz-admin-input" required min="1" max="10000" placeholder="20" />
              </div>
            </div>
            <div id="tmz-coupon-msg" class="tmz-admin-msg"></div>
            <div class="tmz-admin-actions-row">
              <button type="submit" class="tmz-admin-btn tmz-admin-btn-primary">Save Coupon</button>
            </div>
          </form>
        </div>

        ${couponList.length ? `
          <div class="tmz-admin-coupon-grid">
            ${couponList.map((c) => `
              <div class="tmz-admin-coupon-card">
                <div>
                  <span class="tmz-label" style="margin-bottom: 6px;">PROMO CODE</span>
                  <strong class="tmz-admin-coupon-code">${escapeText(c.code)}</strong>
                  <div class="tmz-admin-actions-row">
                    <span class="tmz-admin-status tmz-admin-status--warn">${escapeText(c.label || (c.type === 'flat' ? `₹${c.value} off` : `${c.value}% off`))}</span>
                    <span class="tmz-admin-status tmz-admin-status--live">Active</span>
                  </div>
                </div>
                <button type="button" class="tmz-delete-coupon-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-code="${c.code}">
                  Delete
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="tmz-admin-empty">
            <h3>No active promotional coupons</h3>
            <p>Click "+ Create New Coupon" to offer instant discounts to buyers.</p>
          </div>
        `}
      </div>
    `;

    document.getElementById('tmz-open-coupon-modal')?.addEventListener('click', () => {
      document.getElementById('tmz-coupon-form-box').style.display = 'block';
    });
    document.getElementById('tmz-close-coupon-modal')?.addEventListener('click', () => {
      document.getElementById('tmz-coupon-form-box').style.display = 'none';
    });

    document.getElementById('tmz-create-coupon-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('tmz-cp-code').value;
      const type = document.getElementById('tmz-cp-type').value;
      const value = document.getElementById('tmz-cp-val').value;
      const msg = document.getElementById('tmz-coupon-msg');

      const res = await this.api('coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, type, value })
      });

      if (!res.ok) {
        msg.style.color = '#B3261E';
        msg.textContent = res.data.error || 'Failed to save coupon.';
        return;
      }
      this.renderCouponsTab(mount);
    });

    mount.querySelectorAll('.tmz-delete-coupon-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        if (!confirm(`Delete coupon "${code}"?`)) return;
        const res = await this.api(`coupons/${code}`, { method: 'DELETE' });
        if (res.ok) this.renderCouponsTab(mount);
      });
    });
  }

  // ---------------------------------------------------------------- LEADS TAB
  async renderLeadsTab(mount) {
    const res = await this.api('leads');
    const leads = res.ok && Array.isArray(res.data?.leads) ? res.data.leads : [];

    const totalLeads = leads.length;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayLeads = leads.filter(l => l.createdAt && l.createdAt.startsWith(todayStr)).length;
    const uniqueEmails = [...new Set(leads.map(l => (l.email || '').toLowerCase()))].filter(Boolean);

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">AUDIENCE // CHAPTER 1 SAMPLES</p>
            <h2 class="tmz-admin-section-title">Free Sample Chapter Leads</h2>
            <p class="tmz-admin-section-sub">Prospective readers who unlocked Chapter 1 previews on your storefront.</p>
          </div>
          <div class="tmz-admin-actions-row">
            <button id="tmz-copy-leads-btn" type="button" class="tmz-admin-btn tmz-admin-btn-secondary tmz-admin-btn-sm">
              Copy All Emails (${uniqueEmails.length})
            </button>
            <button id="tmz-export-leads-btn" type="button" class="tmz-admin-btn tmz-admin-btn-primary tmz-admin-btn-sm">
              Export CSV ↓
            </button>
          </div>
        </div>

        <!-- KPI Grid -->
        <div class="tmz-admin-kpi-grid">
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>01 // Total Samples Unlocked</span></div>
            <b class="tmz-admin-kpi-val">${totalLeads}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>02 // Unique Prospective Buyers</span></div>
            <b class="tmz-admin-kpi-val">${uniqueEmails.length}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>03 // New Leads Today</span></div>
            <b class="tmz-admin-kpi-val">${todayLeads}</b>
          </div>
        </div>

        <!-- Leads Table -->
        ${leads.length === 0 ? `
          <div class="tmz-admin-empty">
            <h3>No sample leads recorded yet</h3>
            <p>When visitors enter their email on a book page to read Chapter 1, they will appear here in real-time.</p>
          </div>
        ` : `
          <div class="tmz-admin-table-wrap">
            <div class="tmz-admin-table-scroll">
              <table class="tmz-admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Email</th>
                    <th>Phone / WhatsApp</th>
                    <th>Book Sample</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${leads.map(l => {
                    const dateStr = l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                    const cleanPhone = (l.phone || '').replace(/[^0-9+]/g, '');
                    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;
                    return `
                      <tr>
                        <td style="color: var(--tmz-graphite, #55554F); font-size: 13px; white-space: nowrap;">${dateStr}</td>
                        <td style="font-weight: 600; color: #0B0B0B;">
                          <a href="mailto:${escapeText(l.email)}" style="color: #0B0B0B; text-decoration: none;">${escapeText(l.email)}</a>
                        </td>
                        <td style="font-size: 13px; color: var(--tmz-graphite, #55554F);">
                          ${cleanPhone ? `
                            <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; color: #0B0B0B; text-decoration: underline;">
                              ${escapeText(l.phone)} ↗
                            </a>
                          ` : `<span style="color: #999;">—</span>`}
                        </td>
                        <td style="font-size: 13px; color: #0B0B0B; font-weight: 500;">
                          ${escapeText(l.productName || l.productId || 'E-Book')}
                        </td>
                        <td style="text-align: right;">
                          <button type="button" class="tmz-del-lead-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-id="${l.id}">
                            Remove
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;

    // Copy all emails
    document.getElementById('tmz-copy-leads-btn')?.addEventListener('click', () => {
      if (uniqueEmails.length === 0) return alert('No emails to copy.');
      navigator.clipboard.writeText(uniqueEmails.join(', ')).then(() => {
        alert(`Copied ${uniqueEmails.length} unique emails to clipboard!`);
      });
    });

    // Export CSV
    document.getElementById('tmz-export-leads-btn')?.addEventListener('click', () => {
      if (leads.length === 0) return alert('No leads to export.');
      const headers = ['Date', 'Email', 'Phone', 'Product Name', 'Product ID'];
      const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
      const rows = leads.map(l => [cell(l.createdAt), cell(l.email), cell(l.phone), cell(l.productName), cell(l.productId)]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent.slice('data:text/csv;charset=utf-8,'.length));
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `tamyiz-sample-leads-${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });

    // Delete lead
    mount.querySelectorAll('.tmz-del-lead-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm('Remove this lead from the list?')) return;
        const res = await this.api(`leads/${id}`, { method: 'DELETE' });
        if (res.ok) {
          this.renderLeadsTab(mount);
        } else {
          alert(res.error || 'Failed to remove lead');
        }
      });
    });
  }

  // ---------------------------------------------------------------- REVIEWS TAB
  async renderReviewsTab(mount) {
    const res = await this.api('reviews');
    const data = res.ok ? res.data : { pending: [], approved: [] };
    const pending = Array.isArray(data.pending) ? data.pending : [];
    const approved = Array.isArray(data.approved) ? data.approved : [];

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">MODERATION // SOCIAL PROOF</p>
            <h2 class="tmz-admin-section-title">Reader Reviews &amp; Testimonials</h2>
            <p class="tmz-admin-section-sub">Moderate incoming ratings and comments from readers before they appear live on the storefront.</p>
          </div>
        </div>

        <!-- KPI Grid -->
        <div class="tmz-admin-kpi-grid">
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>01 // Pending Moderation</span></div>
            <b class="tmz-admin-kpi-val ${pending.length > 0 ? 'tmz-admin-kpi-val--danger' : ''}">${pending.length}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>02 // Live Approved Reviews</span></div>
            <b class="tmz-admin-kpi-val tmz-admin-kpi-val--ok">${approved.length}</b>
          </div>
          <div class="tmz-admin-kpi-card">
            <div class="tmz-admin-kpi-label"><span>03 // Total Submissions</span></div>
            <b class="tmz-admin-kpi-val">${pending.length + approved.length}</b>
          </div>
        </div>

        <!-- Section 1: Pending Reviews -->
        <div class="tmz-admin-panel ${pending.length > 0 ? 'tmz-admin-panel--priority' : ''}" style="margin-bottom: 24px;">
          <div class="tmz-admin-panel-head">
            <h3 class="tmz-admin-panel-title">
              <span>Awaiting Your Approval</span>
              <span class="tmz-admin-status ${pending.length > 0 ? 'tmz-admin-status--warn' : 'tmz-admin-status--muted'}">${pending.length}</span>
            </h3>
          </div>

          ${pending.length === 0 ? `
            <p style="font-size: 14px; color: var(--tmz-graphite, #55554F); margin: 0;">No pending reviews. All reader submissions have been moderated.</p>
          ` : `
            <div class="tmz-admin-review-list">
              ${pending.map(r => `
                <div class="tmz-admin-review-card">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                    <div>
                      <div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span class="tmz-admin-review-stars">${'★'.repeat(r.rating || 5)}${'☆'.repeat(5 - (r.rating || 5))}</span>
                        ${r.verifiedBuyer ? `
                          <span class="tmz-admin-status tmz-admin-status--live">✓ Verified Buyer</span>
                        ` : ''}
                      </div>
                      <strong style="font-family: var(--font-head); font-size: 15px; color: #0B0B0B;">${escapeText(r.name)}</strong>
                      <span style="font-size: 13px; color: var(--tmz-graphite, #55554F); margin-left: 6px;">(${escapeText(r.email)})</span>
                    </div>
                    <div class="tmz-admin-actions-row">
                      <button type="button" class="tmz-approve-rev-btn tmz-admin-btn tmz-admin-btn-primary tmz-admin-btn-sm" data-id="${r.id}">
                        Approve &amp; Publish ✓
                      </button>
                      <button type="button" class="tmz-delete-rev-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-id="${r.id}">
                        Reject / Delete
                      </button>
                    </div>
                  </div>
                  <div style="font-size: 13px; color: var(--tmz-graphite, #55554F);">Book: <strong style="color: #0B0B0B;">${escapeText(r.bookName || r.productId)}</strong></div>
                  <blockquote class="tmz-admin-review-quote">
                    "${escapeText(r.comment)}"
                  </blockquote>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Section 2: Approved Reviews Table -->
        <div class="tmz-admin-panel">
          <div class="tmz-admin-panel-head">
            <h3 class="tmz-admin-panel-title">
              <span>Published Storefront Reviews</span>
              <span class="tmz-admin-status tmz-admin-status--ink">${approved.length}</span>
            </h3>
          </div>

          ${approved.length === 0 ? `
            <p style="font-size: 14px; color: var(--tmz-graphite, #55554F); margin: 0;">No approved reviews published yet.</p>
          ` : `
            <div class="tmz-admin-table-wrap">
              <div class="tmz-admin-table-scroll">
                <table class="tmz-admin-table">
                  <thead>
                    <tr>
                      <th>Rating</th>
                      <th>Reviewer</th>
                      <th>Book</th>
                      <th>Feedback</th>
                      <th style="text-align: right;">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${approved.map(r => `
                      <tr>
                        <td style="white-space: nowrap;">
                          <span class="tmz-admin-review-stars">${'★'.repeat(r.rating || 5)}</span>
                        </td>
                        <td style="font-weight: 600; color: #0B0B0B; white-space: nowrap;">
                          ${escapeText(r.name)}
                          ${r.verifiedBuyer ? '<span class="tmz-admin-status tmz-admin-status--live" style="margin-left: 6px;">✓</span>' : ''}
                        </td>
                        <td style="font-size: 13px; color: var(--tmz-graphite, #55554F); white-space: nowrap;">${escapeText(r.bookName || r.productId)}</td>
                        <td style="font-size: 13px; color: #222; max-width: 340px;">
                          "${escapeText(r.comment)}"
                        </td>
                        <td style="text-align: right;">
                          <button type="button" class="tmz-delete-rev-btn tmz-admin-btn tmz-admin-btn-danger tmz-admin-btn-sm" data-id="${r.id}">
                            Remove
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    // Hook approve
    mount.querySelectorAll('.tmz-approve-rev-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const res = await this.api(`reviews/${id}/approve`, { method: 'POST' });
        if (res.ok) {
          this.renderReviewsTab(mount);
        } else {
          alert(res.error || 'Failed to approve review');
        }
      });
    });

    // Hook delete
    mount.querySelectorAll('.tmz-delete-rev-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm('Permanently remove this review?')) return;
        const res = await this.api(`reviews/${id}`, { method: 'DELETE' });
        if (res.ok) {
          this.renderReviewsTab(mount);
        } else {
          alert(res.error || 'Failed to remove review');
        }
      });
    });
  }

  // ---------------------------------------------------------------- ANNOUNCEMENT TAB
  async renderAnnouncementTab(mount) {
    const res = await this.api('announcement');
    const ann = res.ok && res.data.announcement ? res.data.announcement : { enabled: false, text: '', link: '', linkText: '' };

    mount.innerHTML = `
      <div class="tmz-admin-panel tmz-frame">
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">STOREFRONT // TOP RIBBON</p>
            <h2 class="tmz-admin-section-title">Storefront Announcement Banner</h2>
            <p class="tmz-admin-section-sub">Display an editorial announcement bar at the very top of your TAMYIZ website for launches, sales, or notices.</p>
          </div>
          <span class="tmz-admin-status ${ann.enabled ? 'tmz-admin-status--warn' : 'tmz-admin-status--muted'}">
            ${ann.enabled ? 'Live on Storefront' : 'Disabled'}
          </span>
        </div>

        <form id="tmz-announcement-form">
          <div class="tmz-admin-check-row">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="tmz-ann-enabled" ${ann.enabled ? 'checked' : ''} style="width: 17px; height: 17px;" />
              <span style="font-family: var(--font-head); font-weight: 600; font-size: 14.5px;">Enable Banner on Storefront</span>
            </label>
          </div>

          <div class="tmz-admin-field">
            <label for="tmz-ann-text" class="tmz-admin-field-label">Banner Text *</label>
            <input type="text" id="tmz-ann-text" class="tmz-admin-input" maxlength="200" value="${escapeText(ann.text || '')}" placeholder="e.g. Ramadhan Special: 20% off all AI Playbooks with code EID20" />
          </div>

          <div class="tmz-admin-form-grid-2" style="margin-bottom: 20px;">
            <div>
              <label for="tmz-ann-link" class="tmz-admin-field-label">Target URL (Optional)</label>
              <input type="text" id="tmz-ann-link" class="tmz-admin-input" maxlength="150" value="${escapeText(ann.link || '')}" placeholder="/editions or https://..." />
            </div>
            <div>
              <label for="tmz-ann-linktext" class="tmz-admin-field-label">Link Action Label (Optional)</label>
              <input type="text" id="tmz-ann-linktext" class="tmz-admin-input" maxlength="50" value="${escapeText(ann.linkText || '')}" placeholder="Explore Editions ↗" />
            </div>
          </div>

          <div id="tmz-ann-msg" class="tmz-admin-msg"></div>

          <button type="submit" id="tmz-save-ann-btn" class="tmz-admin-btn tmz-admin-btn-primary">
            Save Announcement Banner
          </button>
        </form>
      </div>
    `;

    document.getElementById('tmz-announcement-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enabled = document.getElementById('tmz-ann-enabled').checked;
      const text = document.getElementById('tmz-ann-text').value;
      const link = document.getElementById('tmz-ann-link').value;
      const linkText = document.getElementById('tmz-ann-linktext').value;
      const msg = document.getElementById('tmz-ann-msg');
      const btn = document.getElementById('tmz-save-ann-btn');

      btn.disabled = true;
      btn.textContent = 'Saving…';

      const res = await this.api('announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, text, link, linkText })
      });

      btn.disabled = false;
      btn.textContent = 'Save Announcement Banner';

      if (!res.ok) {
        msg.style.color = '#B3261E';
        msg.textContent = res.data.error || 'Failed to save announcement.';
        return;
      }
      msg.style.color = '#1E7B2E';
      msg.textContent = 'Announcement banner updated live on storefront!';
    });
  }

  // ---------------------------------------------------------------- CUSTOMERS TAB
  async renderCustomersTab(mount) {
    const res = await this.api('customers');
    this.customers = res.ok ? (res.data.customers || []) : [];

    mount.innerHTML = `
      <div>
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">DIRECTORY // VERIFIED BUYERS</p>
            <h2 class="tmz-admin-section-title">Customers Directory</h2>
            <p class="tmz-admin-section-sub">Aggregated buyer profiles with order histories and lifetime spend.</p>
          </div>
          <span class="tmz-admin-status tmz-admin-status--ink">${this.customers.length} Profiles</span>
        </div>

        ${this.customers.length ? `
          <div class="tmz-admin-table-wrap">
            <div class="tmz-admin-table-scroll">
              <table class="tmz-admin-table">
                <thead>
                  <tr>
                    <th>Email / Identifier</th>
                    <th>Phone</th>
                    <th>Orders Count</th>
                    <th>Lifetime Spend</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.customers.map((c) => `
                    <tr>
                      <td style="font-weight: 600; color: #0B0B0B;">${escapeText(c.email)}</td>
                      <td style="color: var(--tmz-graphite, #55554F);">${escapeText(c.phone || '—')}</td>
                      <td>
                        <span class="tmz-admin-status tmz-admin-status--muted">${c.ordersCount}</span>
                      </td>
                      <td style="font-family: var(--font-head); font-weight: 700;">₹${Number(c.totalSpentINR || 0).toLocaleString('en-IN')}</td>
                      <td style="font-size: 12.5px; color: var(--tmz-graphite, #55554F);">
                        ${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="tmz-admin-empty">
            <h3>No registered customer profiles</h3>
            <p>No customer purchase records found yet.</p>
          </div>
        `}
      </div>
    `;
  }

  // ---------------------------------------------------------------- ANALYTICS TAB
  async renderAnalyticsTab(mount) {
    mount.innerHTML = `
      <div class="tmz-admin-panel--ink tmz-frame">
        <div class="tmz-admin-section-head" style="border-bottom-color: rgba(255,255,255,0.14);">
          <div>
            <p class="tmz-label">TELEMETRY // CLOUDFLARE EDGE</p>
            <h2 class="tmz-admin-section-title">Visitor Telemetry</h2>
            <p class="tmz-admin-section-sub">Cloudflare Web Analytics (Cookieless and privacy compliant).</p>
          </div>
          <div class="tmz-admin-range-group">
            <button type="button" class="tmz-stat-range-btn ${this.statsDays === 1 ? 'is-active' : ''}" data-days="1">Today</button>
            <button type="button" class="tmz-stat-range-btn ${this.statsDays === 7 ? 'is-active' : ''}" data-days="7">7 Days</button>
            <button type="button" class="tmz-stat-range-btn ${this.statsDays === 30 ? 'is-active' : ''}" data-days="30">30 Days</button>
          </div>
        </div>

        <div id="tmz-stats-content">
          <p style="color: #A9A9A3; margin: 0;">Connecting to Cloudflare Analytics…</p>
        </div>
      </div>
    `;

    mount.querySelectorAll('.tmz-stat-range-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        this.statsDays = Number(e.currentTarget.dataset.days);
        this.renderAnalyticsTab(mount);
      });
    });

    const statsBox = document.getElementById('tmz-stats-content');
    const res = await this.api(`stats?days=${this.statsDays}`);
    if (!res.ok) {
      statsBox.innerHTML = `
        <div style="background: var(--tmz-yellow, #FFD60A); border: 1px solid #0B0B0B; color: #0B0B0B; padding: 14px 16px; border-radius: 4px; font-size: 13.5px; font-weight: 600;">
          ${escapeText(res.data.error || 'Analytics token not active or accessible.')}
        </div>
      `;
      return;
    }

    const d = res.data;
    const num = (n) => Number(n || 0).toLocaleString('en-IN');

    statsBox.innerHTML = `
      <div class="tmz-admin-telemetry-kpis">
        <div class="tmz-admin-telemetry-card">
          <b>${num(d.visits)}</b>
          <span>Visits in the last ${this.statsDays === 1 ? '24 hours' : `${this.statsDays} days`}</span>
        </div>
        <div class="tmz-admin-telemetry-card">
          <b>${num(d.pageViews)}</b>
          <span>Page Views ${d.visits ? `(${((d.pageViews || 0) / (d.visits || 1)).toFixed(1)} per visit)` : ''}</span>
        </div>
      </div>

      <div class="tmz-admin-telemetry-cols">
        <div>
          <h3>Top Sources</h3>
          ${(d.sources || []).map((s) => `
            <div class="tmz-admin-telemetry-row">
              <span>${escapeText(s.name)}</span>
              <strong style="color: #FFFFFF;">${num(s.visits)}</strong>
            </div>
          `).join('')}
        </div>
        <div>
          <h3>Most Read Pages</h3>
          ${(d.pages || []).filter((p) => !p.path.startsWith('/admin')).slice(0, 6).map((p) => `
            <div class="tmz-admin-telemetry-row">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 190px;">${escapeText(p.path === '/' ? 'Home' : p.path)}</span>
              <strong style="color: #FFFFFF;">${num(p.pageViews)}</strong>
            </div>
          `).join('')}
        </div>
        <div>
          <h3>Countries</h3>
          ${(d.countries || []).slice(0, 6).map((c) => `
            <div class="tmz-admin-telemetry-row">
              <span>${escapeText(c.name)}</span>
              <strong style="color: #FFFFFF;">${num(c.visits)}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------- SETTINGS TAB
  async renderSettingsTab(mount) {
    const res = await this.api('settings');
    const cfg = res.ok && res.data.storeConfig ? res.data.storeConfig : {};

    mount.innerHTML = `
      <div class="tmz-admin-panel tmz-frame">
        <div class="tmz-admin-section-head">
          <div>
            <p class="tmz-label">DIAGNOSTICS // INFRASTRUCTURE</p>
            <h2 class="tmz-admin-section-title">System Diagnostics &amp; Settings</h2>
            <p class="tmz-admin-section-sub">Environment variable status and infrastructure health checks.</p>
          </div>
        </div>

        <div class="tmz-admin-diag-list">
          <div class="tmz-admin-diag-row">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Cloudflare KV Catalog Storage</strong>
              <span style="font-size: 13px; color: var(--tmz-graphite, #55554F);">Binding: TAMYIZ_STORE (1GB storage)</span>
            </div>
            <span class="tmz-admin-status ${cfg.hasStorage ? 'tmz-admin-status--live' : 'tmz-admin-status--danger'}">
              ${cfg.hasStorage ? 'Active & Ready' : 'Disconnected'}
            </span>
          </div>

          <div class="tmz-admin-diag-row">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Razorpay Payment Gateway</strong>
              <span style="font-size: 13px; color: var(--tmz-graphite, #55554F);">Key: ${escapeText(cfg.razorpayKeyId || 'None')} ${cfg.isSandbox ? '(SANDBOX MODE ENABLED)' : ''}</span>
            </div>
            <span class="tmz-admin-status ${cfg.hasRazorpay ? 'tmz-admin-status--live' : 'tmz-admin-status--warn'}">
              ${cfg.hasRazorpay ? 'Configured' : 'Missing Production Keys'}
            </span>
          </div>

          <div class="tmz-admin-diag-row">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Receipt Email Dispatcher (Brevo / Resend)</strong>
              <span style="font-size: 13px; color: var(--tmz-graphite, #55554F);">Sender: ${escapeText(cfg.receiptSender || 'tamyiz.co@gmail.com')}</span>
            </div>
            <span class="tmz-admin-status ${(cfg.hasBrevo || cfg.hasResend) ? 'tmz-admin-status--live' : 'tmz-admin-status--danger'}">
              ${cfg.hasBrevo ? 'Brevo Connected' : cfg.hasResend ? 'Resend Connected' : 'Unconfigured'}
            </span>
          </div>

          <div class="tmz-admin-diag-row">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Signed Digital Asset Vault</strong>
              <span style="font-size: 13px; color: var(--tmz-graphite, #55554F);">Time-expiring HMAC signed download links</span>
            </div>
            <span class="tmz-admin-status tmz-admin-status--live">
              Secured (1-Year Tokens)
            </span>
          </div>

          <div class="tmz-admin-diag-row">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Admin Login Protection (Zero-KV Rate Limit + Email 2FA)</strong>
              <span style="font-size: 13px; color: var(--tmz-graphite, #55554F);">${cfg.hasAdmin2FA ? `6-digit Email OTP active (${escapeText(cfg.adminOtpEmail)})` : 'In-memory brute-force lockout active (0 KV writes)'}</span>
            </div>
            <span class="tmz-admin-status tmz-admin-status--live">
              ${cfg.hasAdmin2FA ? '2FA + Zero-KV Active' : 'Zero-KV Lockout Active'}
            </span>
          </div>
        </div>
      </div>
    `;
  }
}
