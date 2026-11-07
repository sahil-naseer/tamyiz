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
import { escapeText } from '../tamyiz-unified-app.js';

const STATUS_MAP = { draft: 'Draft', soon: 'Coming soon', 'on-sale': 'On sale' };
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

export class AdminController {
  constructor(app) {
    this.app = app;
    this.isAuthenticated = false;
    this.activeTab = 'overview';
    this.editingProduct = null;
    this.coverBlob = null;
    this.thumbBlob = null;
    this.products = [];
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
    const allowed = ['products', 'orders', 'coupons', 'announcement', 'customers', 'analytics', 'settings'];
    this.activeTab = allowed.includes(subRoute) ? subRoute : 'overview';

    container.innerHTML = `
      <div class="tmz-admin-root" style="min-height: 85vh; background: #F2F2EF; color: #0B0B0B; font-family: var(--font-body, system-ui, sans-serif);">
        <div id="tmz-admin-content" style="max-width: 1240px; margin: 0 auto; padding: 24px 16px 80px;">
          <div style="text-align: center; padding: 60px 0;">
            <p style="font-family: var(--font-head); font-weight: 600; letter-spacing: 2px; text-transform: uppercase; font-size: 13px; color: #5E5E59;">TAMYIZ™ Administrative Portal</p>
            <p style="color: #71716D; font-size: 15px; margin-top: 8px;">Authenticating secure session…</p>
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
      <div class="tmz-admin-login-card" style="max-width: 420px; margin: 8vh auto 0; background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 24px; padding: 32px 28px; box-shadow: 0 20px 45px -20px rgba(0,0,0,0.2);">
        <div style="width: 48px; height: 48px; border-radius: 14px; background: #0B0B0B; display: grid; place-items: center; margin-bottom: 20px;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2"></rect>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
          </svg>
        </div>
        <p style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #5E5E59; margin: 0 0 6px;">TAMYIZ™ Console</p>
        <h1 style="font-family: var(--font-head); font-weight: 700; font-size: 26px; line-height: 1.2; letter-spacing: -0.5px; margin: 0 0 8px; color: #0B0B0B;">Administrator Access</h1>
        <p style="color: #5E5E59; font-size: 14px; margin: 0 0 24px; line-height: 1.45;">Enter your administrative password to manage the store catalog, customer orders, and operations.</p>
        
        <form id="tmz-admin-login-form">
          <label for="tmz-admin-pass" style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 8px;">Master Password</label>
          <input type="password" id="tmz-admin-pass" autocomplete="current-password" required placeholder="Enter password…" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px; background: #FFFFFF; color: #0B0B0B; outline: none; margin-bottom: 14px;" />
          <div id="tmz-admin-login-msg" style="margin-bottom: 14px; font-size: 14px; font-weight: 500;"></div>
          <button type="submit" id="tmz-admin-login-btn" style="width: 100%; font-family: var(--font-head); font-weight: 600; font-size: 15px; border-radius: 999px; padding: 12px 20px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer; transition: background 0.15s ease;">Sign In to Dashboard</button>
        </form>
      </div>
    `;

    const form = document.getElementById('tmz-admin-login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = document.getElementById('tmz-admin-pass').value;
      const btn = document.getElementById('tmz-admin-login-btn');
      const msg = document.getElementById('tmz-admin-login-msg');

      btn.disabled = true;
      btn.textContent = 'Verifying…';
      msg.textContent = '';

      const res = await this.api('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      });

      btn.disabled = false;
      btn.textContent = 'Sign In to Dashboard';

      if (!res.ok) {
        msg.style.color = '#B3261E';
        msg.textContent = res.data.error || 'Authentication rejected.';
        return;
      }

      this.isAuthenticated = true;
      this.renderDashboardView();
    });
  }

  async renderDashboardView() {
    const mount = document.getElementById('tmz-admin-content');
    if (!mount) return;

    mount.innerHTML = `
      <!-- Admin Top Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(11,11,11,0.1); padding-bottom: 18px; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span style="display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-head); font-weight: 700; font-size: 20px; letter-spacing: -0.4px;">
            <span style="background: #0B0B0B; color: #FFFFFF; font-size: 11px; padding: 3px 8px; border-radius: 999px; letter-spacing: 1px; text-transform: uppercase;">ADMIN</span>
            TAMYIZ™ Operations
          </span>
          <a href="/" target="_blank" style="font-size: 13px; font-weight: 500; color: #5E5E59; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; background: rgba(11,11,11,0.05);">
            Storefront ↗
          </a>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button id="tmz-admin-logout" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; border-radius: 999px; padding: 8px 16px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; color: #0B0B0B; cursor: pointer;">
            Log out
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 12px; margin-bottom: 24px; border-bottom: 1px solid rgba(11,11,11,0.08);">
        ${[
          { id: 'overview', label: 'Overview' },
          { id: 'products', label: 'E-Books & Catalog' },
          { id: 'orders', label: 'Orders & Payments' },
          { id: 'abandoned', label: 'Abandoned Bags' },
          { id: 'coupons', label: 'Coupons & Discounts' },
          { id: 'leads', label: 'Sample Leads' },
          { id: 'reviews', label: 'Reader Reviews' },
          { id: 'announcement', label: 'Store Banner' },
          { id: 'customers', label: 'Customers' },
          { id: 'analytics', label: 'Visitor Analytics' },
          { id: 'settings', label: 'Diagnostics & Settings' }
        ].map((t) => `
          <button type="button" class="tmz-admin-tab-btn" data-tab="${t.id}" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; padding: 10px 18px; border-radius: 999px; border: 1.5px solid ${this.activeTab === t.id ? '#0B0B0B' : 'transparent'}; background: ${this.activeTab === t.id ? '#0B0B0B' : 'transparent'}; color: ${this.activeTab === t.id ? '#FFFFFF' : '#5E5E59'}; cursor: pointer; white-space: nowrap; transition: all 0.15s ease;">
            ${t.label}
          </button>
        `).join('')}
      </div>

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
      const isCur = b.dataset.tab === tab;
      b.style.borderColor = isCur ? '#0B0B0B' : 'transparent';
      b.style.background = isCur ? '#0B0B0B' : 'transparent';
      b.style.color = isCur ? '#FFFFFF' : '#5E5E59';
    });
    this.renderActiveTab();
  }

  async renderActiveTab() {
    const tabBody = document.getElementById('tmz-admin-tab-body');
    if (!tabBody) return;

    tabBody.innerHTML = `<p style="color: #5E5E59; font-size: 14px; padding: 24px 0;">Loading data…</p>`;

    switch (this.activeTab) {
      case 'overview':
        await this.renderOverviewTab(tabBody);
        break;
      case 'products':
        await this.renderProductsTab(tabBody);
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
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 28px;">
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 20px 22px;">
          <span style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #5E5E59; display: block; margin-bottom: 8px;">Gross Revenue</span>
          <b style="font-family: var(--font-head); font-size: 34px; font-weight: 700; color: #0B0B0B; letter-spacing: -1px; display: block;">₹${Number(kpis.totalRevenueINR || 0).toLocaleString('en-IN')}</b>
          <span style="font-size: 13px; color: #1E7B2E; font-weight: 500; display: block; margin-top: 4px;">Verified payments</span>
        </div>

        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 20px 22px;">
          <span style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #5E5E59; display: block; margin-bottom: 8px;">Total Orders</span>
          <b style="font-family: var(--font-head); font-size: 34px; font-weight: 700; color: #0B0B0B; letter-spacing: -1px; display: block;">${Number(kpis.totalOrders || 0).toLocaleString('en-IN')}</b>
          <span style="font-size: 13px; color: #5E5E59; display: block; margin-top: 4px;">Fulfilled digital deliveries</span>
        </div>

        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 20px 22px;">
          <span style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #5E5E59; display: block; margin-bottom: 8px;">Unique Buyers</span>
          <b style="font-family: var(--font-head); font-size: 34px; font-weight: 700; color: #0B0B0B; letter-spacing: -1px; display: block;">${Number(kpis.totalCustomers || 0).toLocaleString('en-IN')}</b>
          <span style="font-size: 13px; color: #5E5E59; display: block; margin-top: 4px;">Customer profiles</span>
        </div>

        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 20px 22px;">
          <span style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #5E5E59; display: block; margin-bottom: 8px;">Active E-Books</span>
          <b style="font-family: var(--font-head); font-size: 34px; font-weight: 700; color: #0B0B0B; letter-spacing: -1px; display: block;">${kpis.onSaleProducts || 0} / ${kpis.totalProducts || 0}</b>
          <span style="font-size: 13px; color: #5E5E59; display: block; margin-top: 4px;">Available in shop</span>
        </div>
      </div>

      <!-- Quick Actions and Best Sellers -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 20px; padding: 24px;">
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0 0 16px; color: #0B0B0B;">Fast Administrative Actions</h2>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button id="tmz-action-add-book" type="button" style="text-align: left; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(11,11,11,0.12); background: #F7F7F5; font-family: var(--font-head); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.15s ease;">
              + Add New E-Book Guide
            </button>
            <button id="tmz-action-gift-book" type="button" style="text-align: left; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(11,11,11,0.12); background: #F7F7F5; font-family: var(--font-head); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.15s ease;">
              🎁 Send Free Gift / Reviewer Link
            </button>
            <button id="tmz-action-coupons" type="button" style="text-align: left; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(11,11,11,0.12); background: #F7F7F5; font-family: var(--font-head); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.15s ease;">
              🏷️ Create / Manage Discount Coupons
            </button>
            <button id="tmz-action-banner" type="button" style="text-align: left; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(11,11,11,0.12); background: #F7F7F5; font-family: var(--font-head); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.15s ease;">
              📢 Update Store Announcement Banner
            </button>
          </div>
        </div>

        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 20px; padding: 24px;">
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0 0 16px; color: #0B0B0B;">Catalog Status & Sales</h2>
          ${(data.bestSellers && data.bestSellers.length) ? `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${data.bestSellers.map((b) => `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(11,11,11,0.06); padding-bottom: 8px;">
                  <div>
                    <strong style="font-family: var(--font-head); font-size: 14px; display: block; color: #0B0B0B;">${escapeText(b.name)}</strong>
                    <span style="font-size: 12px; color: #5E5E59;">Status: ${STATUS_MAP[b.status] || b.status} · ₹${b.price}</span>
                  </div>
                  <span style="font-family: var(--font-head); font-weight: 600; font-size: 13px; background: rgba(11,11,11,0.06); padding: 4px 10px; border-radius: 999px;">
                    ${b.sales} sold
                  </span>
                </div>
              `).join('')}
            </div>
          ` : `
            <p style="color: #5E5E59; font-size: 14px; margin: 0;">No sales recorded yet. Once orders are fulfilled, top-selling e-books will appear here.</p>
          `}
        </div>
      </div>
    `;

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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0; color: #0B0B0B;">E-Book Catalog</h2>
            <p style="color: #5E5E59; font-size: 14px; margin: 4px 0 0;">Manage your digital publications, pricing, covers and downloadable PDFs.</p>
          </div>
          <button id="tmz-add-product-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 11px 22px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
            + Add an E-Book
          </button>
        </div>

        <div id="tmz-product-msg" style="margin-bottom: 14px;"></div>

        <div style="display: grid; gap: 14px;">
          ${this.products.length ? this.products.map((b) => `
            <article class="tmz-admin-product-card" style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 18px 20px; display: grid; grid-template-columns: 84px minmax(0, 1fr) auto; gap: 20px; align-items: center;">
              ${b.coverUrl ? `
                <img src="${b.coverUrl}" alt="" style="width: 84px; height: 126px; object-fit: cover; border-radius: 8px; box-shadow: 0 8px 18px -8px rgba(0,0,0,0.4);" />
              ` : `
                <div style="width: 84px; height: 126px; background: #E6E6E2; border-radius: 8px; display: grid; place-items: center; color: #5E5E59; font-size: 12px; font-weight: 500;">No cover</div>
              `}
              <div>
                <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0 0 6px; color: #0B0B0B; letter-spacing: -0.3px;">${escapeText(b.name)}</h3>
                <p style="color: #5E5E59; font-size: 14px; margin: 0 0 10px;">${escapeText(b.tagline || 'No tagline')}</p>
                <div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #5E5E59; flex-wrap: wrap;">
                  <span style="display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 10px; font-family: var(--font-head); font-weight: 600; font-size: 11px; text-transform: uppercase; background: ${b.status === 'on-sale' ? '#E3F3E7' : b.status === 'soon' ? '#FFF2D6' : '#ECECE8'}; color: ${b.status === 'on-sale' ? '#1E7B2E' : b.status === 'soon' ? '#7A4F00' : '#3A3A36'};">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
                    ${STATUS_MAP[b.status] || b.status}
                  </span>
                  <span>₹${Number(b.price).toLocaleString('en-IN')}</span>
                  <span>·</span>
                  <span>${b.fileSize ? `PDF ${mb(b.fileSize)}` : '<span style="color:#B3261E">Missing PDF</span>'}</span>
                  ${b.pages ? `<span>·</span><span>${b.pages} pages</span>` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" class="tmz-edit-book-btn" data-id="${b.id}" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; cursor: pointer;">
                  Edit
                </button>
                ${b.status !== 'draft' ? `
                  <a href="/edition/${b.slug}" target="_blank" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; color: #0B0B0B; text-decoration: none; display: inline-flex; align-items: center;">
                    View in shop ↗
                  </a>
                ` : ''}
                <button type="button" class="tmz-delete-book-btn" data-id="${b.id}" data-name="${escapeText(b.name)}" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(179,38,30,0.3); background: transparent; color: #B3261E; cursor: pointer;">
                  Delete
                </button>
              </div>
            </article>
          `).join('') : `
            <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 48px 24px; text-align: center; color: #5E5E59;">
              <p style="margin: 0 0 16px; font-size: 15px;">Your store does not have any e-books yet.</p>
              <button id="tmz-first-book-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 11px 22px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
                Add your first e-book
              </button>
            </div>
          `}
        </div>
      </div>

      <!-- Add / Edit Form Modal/Container -->
      <div id="tmz-product-form-view" style="display: none; background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 24px; padding: 28px; box-shadow: 0 20px 45px -20px rgba(0,0,0,0.15);"></div>
    `;

    document.getElementById('tmz-add-product-btn')?.addEventListener('click', () => this.openProductForm(null));
    document.getElementById('tmz-first-book-btn')?.addEventListener('click', () => this.openProductForm(null));

    mount.querySelectorAll('.tmz-edit-book-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = this.products.find((x) => x.id === btn.dataset.id);
        if (p) this.openProductForm(p);
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
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div>
          <p style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #5E5E59; margin: 0 0 4px;">Product Specification</p>
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 24px; margin: 0; color: #0B0B0B;">${b ? 'Edit E-Book' : 'Publish New E-Book'}</h2>
        </div>
        <button id="tmz-cancel-form" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; cursor: pointer;">
          Cancel
        </button>
      </div>

      <form id="tmz-book-form" novalidate>
        <div style="margin-bottom: 18px;">
          <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Title *</label>
          <input type="text" id="tmz-f-name" required maxlength="140" value="${b ? escapeText(b.name) : ''}" placeholder="e.g. The Prompt Engineer's Playbook" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px;" />
        </div>

        <div style="margin-bottom: 18px;">
          <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">One-Line Summary</label>
          <input type="text" id="tmz-f-tagline" maxlength="200" value="${b ? escapeText(b.tagline || '') : ''}" placeholder="Short compelling description shown on cards and headers" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px;">
          <div>
            <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Price in ₹ *</label>
            <input type="number" id="tmz-f-price" required min="1" max="100000" step="1" value="${b ? b.price : ''}" placeholder="499" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px;" />
          </div>
          <div>
            <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Pages (optional)</label>
            <input type="number" id="tmz-f-pages" min="1" max="5000" step="1" value="${b && b.pages ? b.pages : ''}" placeholder="128" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px;" />
          </div>
        </div>

        <div style="margin-bottom: 18px;">
          <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Full Description</label>
          <textarea id="tmz-f-desc" rows="4" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px; resize: vertical;">${b ? escapeText(b.description || '') : ''}</textarea>
        </div>

        <div style="margin-bottom: 18px;">
          <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Chapters & Syllabus (one per line)</label>
          <textarea id="tmz-f-contents" rows="3" style="width: 100%; box-sizing: border-box; font-size: 15px; padding: 12px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 12px; resize: vertical;">${b && b.contents ? b.contents.join('\n') : ''}</textarea>
        </div>

        <div style="margin-bottom: 18px; background: #F7F7F5; border: 1.5px solid rgba(11,11,11,0.12); border-radius: 12px; padding: 16px;">
          <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #0B0B0B;">Free Sample Excerpt (Chapter 1 Lead Magnet)</label>
          <p style="font-size: 12px; color: #5E5E59; margin: 0 0 10px;">Storefront visitors can read this Chapter 1 preview immediately after entering their email.</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Chapter Label</label>
              <input type="text" id="tmz-f-sample-chapter" maxlength="100" value="${b && b.sampleExcerpt && b.sampleExcerpt.chapter ? escapeText(b.sampleExcerpt.chapter) : 'Chapter 01'}" placeholder="Chapter 01" style="width: 100%; box-sizing: border-box; font-size: 14px; padding: 10px 12px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 8px; background: #FFF;" />
            </div>
            <div>
              <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Chapter Subtitle</label>
              <input type="text" id="tmz-f-sample-subtitle" maxlength="150" value="${b && b.sampleExcerpt && b.sampleExcerpt.subtitle ? escapeText(b.sampleExcerpt.subtitle) : ''}" placeholder="Foundations & Principles" style="width: 100%; box-sizing: border-box; font-size: 14px; padding: 10px 12px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 8px; background: #FFF;" />
            </div>
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px;">Chapter 1 Text</label>
            <textarea id="tmz-f-sample-text" rows="4" placeholder="Paste the introductory chapter or excerpt text here..." style="width: 100%; box-sizing: border-box; font-size: 14px; padding: 10px 12px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 8px; background: #FFF; resize: vertical;">${b && b.sampleExcerpt && b.sampleExcerpt.text ? escapeText(b.sampleExcerpt.text) : ''}</textarea>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 22px;">
          <div style="border: 1.5px dashed rgba(11,11,11,0.2); border-radius: 14px; padding: 16px; background: #F7F7F5;">
            <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Cover Image (Portrait 2:3 JPG/PNG/WebP)</label>
            <input type="file" id="tmz-f-cover" accept="image/jpeg,image/png,image/webp" style="margin-bottom: 8px; font-size: 13px;" />
            <div id="tmz-cover-preview" style="margin-top: 8px; ${b && b.coverUrl ? '' : 'display: none;'}">
              <img id="tmz-cover-img" src="${b && b.coverUrl ? b.coverUrl : ''}" style="width: 60px; height: 90px; object-fit: cover; border-radius: 6px;" />
              <span id="tmz-cover-note" style="display: block; font-size: 12px; color: #5E5E59; margin-top: 4px;">${b && b.coverUrl ? 'Current active cover' : ''}</span>
            </div>
          </div>

          <div style="border: 1.5px dashed rgba(11,11,11,0.2); border-radius: 14px; padding: 16px; background: #F7F7F5;">
            <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Deliverable E-Book PDF (Up to 25 MB)</label>
            <input type="file" id="tmz-f-pdf" accept="application/pdf,.pdf" style="margin-bottom: 8px; font-size: 13px;" />
            <span id="tmz-pdf-note" style="display: block; font-size: 12px; color: #5E5E59;">
              ${b && b.fileSize ? `Current PDF: ${b.fileName || 'ebook.pdf'} (${mb(b.fileSize)})` : 'No PDF uploaded yet.'}
            </span>
          </div>
        </div>

        <div style="margin-bottom: 24px;">
          <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 8px;">Storefront Availability</label>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
            <label style="display: flex; gap: 8px; align-items: center; border: 1.5px solid rgba(11,11,11,0.18); border-radius: 12px; padding: 12px; cursor: pointer; background: #FFFFFF;">
              <input type="radio" name="tmz_status" value="draft" ${!b || b.status === 'draft' ? 'checked' : ''} />
              <div>
                <strong style="display: block; font-size: 14px; font-family: var(--font-head);">Draft</strong>
                <span style="font-size: 12px; color: #5E5E59;">Hidden from storefront</span>
              </div>
            </label>
            <label style="display: flex; gap: 8px; align-items: center; border: 1.5px solid rgba(11,11,11,0.18); border-radius: 12px; padding: 12px; cursor: pointer; background: #FFFFFF;">
              <input type="radio" name="tmz_status" value="soon" ${b && b.status === 'soon' ? 'checked' : ''} />
              <div>
                <strong style="display: block; font-size: 14px; font-family: var(--font-head);">Coming Soon</strong>
                <span style="font-size: 12px; color: #5E5E59;">WhatsApp pre-orders</span>
              </div>
            </label>
            <label style="display: flex; gap: 8px; align-items: center; border: 1.5px solid rgba(11,11,11,0.18); border-radius: 12px; padding: 12px; cursor: pointer; background: #FFFFFF;">
              <input type="radio" name="tmz_status" value="on-sale" ${b && b.status === 'on-sale' ? 'checked' : ''} />
              <div>
                <strong style="display: block; font-size: 14px; font-family: var(--font-head);">On Sale</strong>
                <span style="font-size: 12px; color: #5E5E59;">Instant digital checkout</span>
              </div>
            </label>
          </div>
        </div>

        <div id="tmz-form-msg" style="margin-bottom: 16px; font-size: 14px; font-weight: 500;"></div>
        <progress id="tmz-progress" max="100" value="0" style="display: none; width: 100%; height: 8px; margin-bottom: 14px;"></progress>

        <div style="display: flex; gap: 12px;">
          <button type="submit" id="tmz-save-btn" style="font-family: var(--font-head); font-weight: 600; font-size: 15px; border-radius: 999px; padding: 12px 28px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
            Save E-Book
          </button>
          <button type="button" id="tmz-form-cancel-btn" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 12px 22px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; cursor: pointer;">
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
        const { blob: bigBlob } = await this.shrinkBitmap(raw, 1200, 0.86);
        const { blob: smBlob } = await this.shrinkBitmap(raw, 720, 0.8);
        this.coverBlob = bigBlob;
        this.thumbBlob = smBlob;

        const prev = document.getElementById('tmz-cover-preview');
        const img = document.getElementById('tmz-cover-img');
        const note = document.getElementById('tmz-cover-note');
        img.src = URL.createObjectURL(this.coverBlob);
        note.textContent = `New cover ready (${Math.round(this.coverBlob.size / 1024)} KB)`;
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

  // ---------------------------------------------------------------- ORDERS TAB
  async renderOrdersTab(mount) {
    const query = this.orderSearchQuery.trim();
    const res = await this.api(`orders${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    this.orders = res.ok ? (res.data.orders || []) : [];

    mount.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0; color: #0B0B0B;">Orders & Fulfillments</h2>
            <p style="color: #5E5E59; font-size: 14px; margin: 4px 0 0;">Customer transactions, gift orders, and digital download links.</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="tmz-btn-open-gift" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 10px 18px; border-radius: 999px; border: 1.5px solid #0B0B0B; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
              🎁 Send Gift Copy
            </button>
            <input type="text" id="tmz-order-search" placeholder="Search reference, email, phone…" value="${escapeText(this.orderSearchQuery)}" style="padding: 10px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 999px; font-size: 14px; min-width: 220px;" />
            <button id="tmz-order-search-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 10px 18px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; color: #0B0B0B; cursor: pointer;">Search</button>
          </div>
        </div>

        <!-- Gift Order Modal -->
        <div id="tmz-gift-modal" style="display: none; background: #FFFFFF; border: 1px solid rgba(11,11,11,0.15); border-radius: 20px; padding: 24px; margin-bottom: 24px; box-shadow: 0 15px 35px -15px rgba(0,0,0,0.15);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0;">Send Free Gift / Review Copy</h3>
            <button id="tmz-close-gift-modal" type="button" style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
          </div>
          <form id="tmz-gift-form">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 14px;">
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Recipient Email *</label>
                <input type="email" id="tmz-gift-email" required placeholder="reviewer@example.com" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid rgba(11,11,11,0.2);" />
              </div>
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Phone (Optional)</label>
                <input type="tel" id="tmz-gift-phone" placeholder="9876543210" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid rgba(11,11,11,0.2);" />
              </div>
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">E-Book Edition *</label>
                <select id="tmz-gift-product" required style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid rgba(11,11,11,0.2);">
                  ${this.products.map((p) => `<option value="${p.id}">${escapeText(p.name)} (₹${p.price})</option>`).join('')}
                </select>
              </div>
            </div>
            <div id="tmz-gift-result" style="margin-bottom: 14px; font-size: 14px;"></div>
            <button type="submit" id="tmz-gift-submit-btn" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 10px 22px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
              Generate &amp; Dispatch Gift Order
            </button>
          </form>
        </div>

        ${this.orders.length ? `
          <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; overflow-x: auto; box-shadow: 0 4px 14px rgba(0,0,0,0.03);">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(11,11,11,0.08); background: #F7F7F5;">
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Order Ref</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Customer</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Items Purchased</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Total</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.orders.map((o) => `
                  <tr style="border-bottom: 1px solid rgba(11,11,11,0.06);">
                    <td style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600;">
                      ${escapeText(o.referenceId || o.orderId)}
                      <span style="display: block; font-size: 11px; color: #5E5E59; font-weight: 400;">${escapeText(o.paymentId || '')}</span>
                      <span style="font-size: 11px; color: #8F8F89;">${o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                    </td>
                    <td style="padding: 14px 16px;">
                      <div style="font-weight: 500;">${escapeText(o.email || '—')}</div>
                      <div style="font-size: 12px; color: #5E5E59;">${escapeText(o.phone || '')}</div>
                    </td>
                    <td style="padding: 14px 16px;">
                      ${(o.items || []).map((i) => `<span style="display: inline-block; background: rgba(11,11,11,0.06); padding: 2px 8px; border-radius: 6px; font-size: 12px; margin-right: 4px; margin-bottom: 4px;">${escapeText(i.name)}</span>`).join('')}
                    </td>
                    <td style="padding: 14px 16px; font-family: var(--font-head); font-weight: 700;">
                      ₹${o.totalINR || Math.round((o.amountPaise || 0) / 100)}
                    </td>
                    <td style="padding: 14px 16px;">
                      <button type="button" class="tmz-resend-btn" data-id="${o.orderId}" style="font-family: var(--font-head); font-weight: 600; font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; cursor: pointer;">
                        Re-send Email ✉
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 48px 24px; text-align: center; color: #5E5E59;">
            <p style="margin: 0;">${query ? `No customer orders match "${escapeText(query)}".` : 'No orders recorded yet. As customers buy on the storefront, all transactions appear here.'}</p>
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
        <input type="text" readonly value="${res.data.downloadUrl}" style="width: 100%; box-sizing: border-box; padding: 6px; font-size: 12px; margin-top: 4px;" onclick="this.select()" />
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
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div>
          <p style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #5E5E59; margin: 0 0 4px;">Checkout Funnel &amp; Revenue Recovery</p>
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 24px; margin: 0; color: #0B0B0B;">Abandoned Reading Bags</h2>
          <p style="font-size: 14px; color: #5E5E59; margin: 4px 0 0;">Visitors who entered their email in the checkout bag but left before completing payment.</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="tmz-copy-abandoned-emails-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: #FFFFFF; color: #0B0B0B; cursor: pointer; transition: all 0.15s ease;">
            📋 Copy All Emails (${uniqueEmails.length})
          </button>
          <button id="tmz-export-abandoned-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid #0B0B0B; background: #0B0B0B; color: #FFFFFF; cursor: pointer; transition: all 0.15s ease;">
            📥 Export CSV
          </button>
        </div>
      </div>

      <!-- KPI Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Unclaimed Revenue</span>
          <strong style="font-size: 28px; font-weight: 700; color: #B3261E; font-family: var(--font-head);">₹${(data.totalLostRevenue || 0).toLocaleString('en-IN')}</strong>
        </div>
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Abandoned Sessions</span>
          <strong style="font-size: 28px; font-weight: 700; color: #0B0B0B; font-family: var(--font-head);">${list.length}</strong>
        </div>
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Successfully Recovered</span>
          <strong style="font-size: 28px; font-weight: 700; color: #1E7B2E; font-family: var(--font-head);">${data.recoveredCount || 0}</strong>
        </div>
      </div>

      <!-- Table Container -->
      <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; overflow: hidden;">
        ${list.length === 0 ? `
          <div style="padding: 48px 24px; text-align: center; color: #5E5E59;">
            <p style="font-size: 16px; font-weight: 600; color: #0B0B0B; margin: 0 0 4px;">No abandoned checkouts recorded</p>
            <p style="font-size: 14px; margin: 0;">When visitors enter their email in the bag drawer, uncompleted carts will appear here.</p>
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 1.5px solid rgba(11,11,11,0.08); background: #FAF9F6; font-size: 12px; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.06em;">
                  <th style="padding: 14px 16px; font-weight: 600;">Last Seen</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Customer Contact</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Books In Bag</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Cart Value</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Status</th>
                  <th style="padding: 14px 16px; font-weight: 600; text-align: right;">Action</th>
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
                    <tr style="border-bottom: 1px solid rgba(11,11,11,0.06); ${isRecovered ? 'opacity: 0.75; background: #FAFDF9;' : ''}">
                      <td style="padding: 14px 16px; color: #5E5E59; font-size: 13px; white-space: nowrap;">${dateStr}</td>
                      <td style="padding: 14px 16px;">
                        <a href="mailto:${escapeText(c.email)}" style="font-weight: 600; color: #0B0B0B; text-decoration: none; display: block;">${escapeText(c.email)}</a>
                        ${cleanPhone ? `
                          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #1E7B2E; text-decoration: underline; margin-top: 2px; display: inline-flex; align-items: center; gap: 4px;">
                            WhatsApp: ${escapeText(c.phone)} ↗
                          </a>
                        ` : ''}
                      </td>
                      <td style="padding: 14px 16px; font-size: 13px;">
                        ${(c.items || []).map(i => `<div style="font-weight: 500; color: #0B0B0B;">• ${escapeText(i.name)}</div>`).join('')}
                      </td>
                      <td style="padding: 14px 16px; font-weight: 700; color: #0B0B0B; font-family: monospace; white-space: nowrap;">
                        ₹${(c.total || c.subtotal || 0).toLocaleString('en-IN')}
                      </td>
                      <td style="padding: 14px 16px; white-space: nowrap;">
                        ${isRecovered ? `
                          <span style="font-size: 11px; font-weight: 700; background: #E8F5E9; color: #2E7D32; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
                            ✓ Recovered
                          </span>
                        ` : c.emailSent ? `
                          <span style="font-size: 11px; font-weight: 700; background: #E3F2FD; color: #1565C0; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
                            Emailed
                          </span>
                        ` : `
                          <span style="font-size: 11px; font-weight: 700; background: #FFF3E0; color: #E65100; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">
                            Abandoned
                          </span>
                        `}
                      </td>
                      <td style="padding: 14px 16px; text-align: right; white-space: nowrap;">
                        ${!isRecovered ? `
                          <button type="button" class="tmz-send-abandoned-btn" data-id="${c.id}" style="font-family: var(--font-head); font-weight: 700; font-size: 12px; padding: 6px 12px; background: #0B0B0B; color: #FFF; border: none; border-radius: 6px; cursor: pointer; margin-right: 6px;">
                            ${c.emailSent ? 'Re-send Email' : 'Send Recovery Email'}
                          </button>
                        ` : ''}
                        <button type="button" class="tmz-del-abandoned-btn" data-id="${c.id}" style="background: none; border: none; color: #B3261E; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 6px;">
                          Remove
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0; color: #0B0B0B;">Discount Coupons & Promo Codes</h2>
            <p style="color: #5E5E59; font-size: 14px; margin: 4px 0 0;">Create and manage promotional discount codes that work in the checkout bag.</p>
          </div>
          <button id="tmz-open-coupon-modal" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 11px 22px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
            + Create New Coupon
          </button>
        </div>

        <div id="tmz-coupon-form-box" style="display: none; background: #FFFFFF; border: 1px solid rgba(11,11,11,0.15); border-radius: 20px; padding: 24px; margin-bottom: 24px;">
          <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0 0 16px;">New Promotional Coupon</h3>
          <form id="tmz-create-coupon-form">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px;">
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Coupon Code (e.g. LAUNCH20) *</label>
                <input type="text" id="tmz-cp-code" required maxlength="20" placeholder="EID25" style="width: 100%; box-sizing: border-box; text-transform: uppercase; padding: 10px; border-radius: 10px; border: 1.5px solid rgba(11,11,11,0.2);" />
              </div>
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Discount Type *</label>
                <select id="tmz-cp-type" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid rgba(11,11,11,0.2);">
                  <option value="percent">Percentage (% off)</option>
                  <option value="flat">Flat Amount (₹ INR off)</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Discount Value *</label>
                <input type="number" id="tmz-cp-val" required min="1" max="10000" placeholder="20" style="width: 100%; box-sizing: border-box; padding: 10px; border-radius: 10px; border: 1.5px solid rgba(11,11,11,0.2);" />
              </div>
            </div>
            <div id="tmz-coupon-msg" style="margin-bottom: 12px; font-size: 14px;"></div>
            <div style="display: flex; gap: 10px;">
              <button type="submit" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 10px 22px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">Save Coupon</button>
              <button type="button" id="tmz-close-coupon-modal" style="font-family: var(--font-head); font-weight: 600; font-size: 14px; border-radius: 999px; padding: 10px 22px; border: 1.5px solid rgba(11,11,11,0.2); background: transparent; cursor: pointer;">Cancel</button>
            </div>
          </form>
        </div>

        ${couponList.length ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
            ${couponList.map((c) => `
              <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="font-family: var(--font-head); font-size: 18px; letter-spacing: 1px; color: #0B0B0B; display: block;">${escapeText(c.code)}</strong>
                  <span style="font-size: 13px; color: #1E7B2E; font-weight: 600;">${escapeText(c.label || (c.type === 'flat' ? `₹${c.value} off` : `${c.value}% off`))}</span>
                  <span style="display: block; font-size: 11px; color: #8F8F89; margin-top: 4px;">Active</span>
                </div>
                <button type="button" class="tmz-delete-coupon-btn" data-code="${c.code}" style="font-family: var(--font-head); font-weight: 600; font-size: 12px; padding: 6px 14px; border-radius: 999px; border: 1.5px solid rgba(179,38,30,0.3); background: transparent; color: #B3261E; cursor: pointer;">
                  Delete
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 48px 24px; text-align: center; color: #5E5E59;">
            <p style="margin: 0;">No active promotional coupons. Click "+ Create New Coupon" to offer instant discounts to buyers.</p>
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
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div>
          <p style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #5E5E59; margin: 0 0 4px;">Audience & Lead Generation</p>
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 24px; margin: 0; color: #0B0B0B;">Free Sample Chapter Leads</h2>
          <p style="font-size: 14px; color: #5E5E59; margin: 4px 0 0;">Prospective readers who unlocked Chapter 1 previews on your storefront.</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="tmz-copy-leads-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid rgba(11,11,11,0.2); background: #FFFFFF; color: #0B0B0B; cursor: pointer; transition: all 0.15s ease;">
            📋 Copy All Emails (${uniqueEmails.length})
          </button>
          <button id="tmz-export-leads-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 999px; border: 1.5px solid #0B0B0B; background: #0B0B0B; color: #FFFFFF; cursor: pointer; transition: all 0.15s ease;">
            📥 Export CSV
          </button>
        </div>
      </div>

      <!-- KPI Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Total Samples Unlocked</span>
          <strong style="font-size: 28px; font-weight: 700; color: #0B0B0B; font-family: var(--font-head);">${totalLeads}</strong>
        </div>
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Unique Prospective Buyers</span>
          <strong style="font-size: 28px; font-weight: 700; color: #0B0B0B; font-family: var(--font-head);">${uniqueEmails.length}</strong>
        </div>
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">New Leads Today</span>
          <strong style="font-size: 28px; font-weight: 700; color: #0B0B0B; font-family: var(--font-head);">${todayLeads}</strong>
        </div>
      </div>

      <!-- Leads Table -->
      <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; overflow: hidden;">
        ${leads.length === 0 ? `
          <div style="padding: 48px 24px; text-align: center; color: #5E5E59;">
            <p style="font-size: 16px; font-weight: 600; color: #0B0B0B; margin: 0 0 4px;">No sample leads recorded yet</p>
            <p style="font-size: 14px; margin: 0;">When visitors enter their email on a book page to read Chapter 1, they will appear here in real-time.</p>
          </div>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 1.5px solid rgba(11,11,11,0.08); background: #FAF9F6; font-size: 12px; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.06em;">
                  <th style="padding: 14px 16px; font-weight: 600;">Date</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Email</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Phone / WhatsApp</th>
                  <th style="padding: 14px 16px; font-weight: 600;">Book Sample</th>
                  <th style="padding: 14px 16px; font-weight: 600; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${leads.map(l => {
                  const dateStr = l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                  const cleanPhone = (l.phone || '').replace(/[^0-9+]/g, '');
                  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;
                  return `
                    <tr style="border-bottom: 1px solid rgba(11,11,11,0.06);">
                      <td style="padding: 14px 16px; color: #5E5E59; font-size: 13px; white-space: nowrap;">${dateStr}</td>
                      <td style="padding: 14px 16px; font-weight: 600; color: #0B0B0B;">
                        <a href="mailto:${escapeText(l.email)}" style="color: #0B0B0B; text-decoration: none;">${escapeText(l.email)}</a>
                      </td>
                      <td style="padding: 14px 16px; font-size: 13px; color: #5E5E59;">
                        ${cleanPhone ? `
                          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; color: #0B0B0B; text-decoration: underline;">
                            ${escapeText(l.phone)} ↗
                          </a>
                        ` : `<span style="color: #999;">—</span>`}
                      </td>
                      <td style="padding: 14px 16px; font-size: 13px; color: #0B0B0B; font-weight: 500;">
                        ${escapeText(l.productName || l.productId || 'E-Book')}
                      </td>
                      <td style="padding: 14px 16px; text-align: right;">
                        <button type="button" class="tmz-del-lead-btn" data-id="${l.id}" style="background: none; border: none; color: #B3261E; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 4px;">
                          Remove
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
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
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div>
          <p style="font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #5E5E59; margin: 0 0 4px;">Social Proof &amp; Moderation</p>
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 24px; margin: 0; color: #0B0B0B;">Reader Reviews &amp; Testimonials</h2>
          <p style="font-size: 14px; color: #5E5E59; margin: 4px 0 0;">Moderate incoming ratings and comments from readers before they appear live on the storefront.</p>
        </div>
      </div>

      <!-- KPI Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px;">
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Pending Moderation</span>
          <strong style="font-size: 28px; font-weight: 700; color: ${pending.length > 0 ? '#C00' : '#0B0B0B'}; font-family: var(--font-head);">${pending.length}</strong>
        </div>
        <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 14px; padding: 18px 20px;">
          <span style="font-size: 12px; font-weight: 600; color: #5E5E59; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px;">Live Approved Reviews</span>
          <strong style="font-size: 28px; font-weight: 700; color: #1E7B2E; font-family: var(--font-head);">${approved.length}</strong>
        </div>
      </div>

      <!-- Section 1: Pending Reviews -->
      <div style="background: #FFFFFF; border: 1.5px solid ${pending.length > 0 ? '#0B0B0B' : 'rgba(11,11,11,0.08)'}; border-radius: 16px; padding: 24px; margin-bottom: 28px;">
        <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0 0 16px; color: #0B0B0B; display: flex; align-items: center; gap: 8px;">
          <span>⏳ Awaiting Your Approval</span>
          <span style="font-size: 12px; background: #0B0B0B; color: #FFF; padding: 2px 8px; border-radius: 999px;">${pending.length}</span>
        </h3>

        ${pending.length === 0 ? `
          <p style="font-size: 14px; color: #5E5E59; margin: 0;">No pending reviews. All reader submissions have been moderated.</p>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${pending.map(r => `
              <div style="background: #FAF9F6; border: 1px solid rgba(11,11,11,0.1); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                  <div>
                    <div style="color: #F5A623; font-size: 16px; letter-spacing: 2px; margin-bottom: 4px;">
                      ${'★'.repeat(r.rating || 5)}${'☆'.repeat(5 - (r.rating || 5))}
                    </div>
                    <strong style="font-family: var(--font-head); font-size: 15px; color: #0B0B0B;">${escapeText(r.name)}</strong>
                    <span style="font-size: 13px; color: #767670; margin-left: 6px;">(${escapeText(r.email)})</span>
                    ${r.verifiedBuyer ? `
                      <span style="font-size: 11px; background: #E8F5E9; color: #2E7D32; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 8px; text-transform: uppercase;">
                        ✓ Verified Buyer
                      </span>
                    ` : ''}
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button type="button" class="tmz-approve-rev-btn" data-id="${r.id}" style="font-family: var(--font-head); font-weight: 700; font-size: 12px; padding: 6px 14px; background: #0B0B0B; color: #FFF; border: none; border-radius: 6px; cursor: pointer;">
                      Approve &amp; Publish ✓
                    </button>
                    <button type="button" class="tmz-delete-rev-btn" data-id="${r.id}" style="font-family: var(--font-head); font-weight: 600; font-size: 12px; padding: 6px 12px; background: transparent; color: #B3261E; border: 1px solid rgba(179,38,30,0.3); border-radius: 6px; cursor: pointer;">
                      Reject / Delete
                    </button>
                  </div>
                </div>
                <div style="font-size: 13px; color: #5E5E59;">Book: <strong>${escapeText(r.bookName || r.productId)}</strong></div>
                <blockquote style="margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: #222; font-style: italic; border-left: 2px solid #0B0B0B; padding-left: 12px;">
                  "${escapeText(r.comment)}"
                </blockquote>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Section 2: Approved Reviews Table -->
      <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.08); border-radius: 16px; padding: 24px;">
        <h3 style="font-family: var(--font-head); font-weight: 700; font-size: 18px; margin: 0 0 16px; color: #0B0B0B;">
          Published Storefront Reviews (${approved.length})
        </h3>

        ${approved.length === 0 ? `
          <p style="font-size: 14px; color: #5E5E59; margin: 0;">No approved reviews published yet.</p>
        ` : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 1.5px solid rgba(11,11,11,0.08); background: #FAF9F6; font-size: 12px; color: #5E5E59; text-transform: uppercase;">
                  <th style="padding: 12px 14px;">Rating</th>
                  <th style="padding: 12px 14px;">Reviewer</th>
                  <th style="padding: 12px 14px;">Book</th>
                  <th style="padding: 12px 14px;">Feedback</th>
                  <th style="padding: 12px 14px; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${approved.map(r => `
                  <tr style="border-bottom: 1px solid rgba(11,11,11,0.06);">
                    <td style="padding: 12px 14px; color: #F5A623; white-space: nowrap;">${'★'.repeat(r.rating || 5)}</td>
                    <td style="padding: 12px 14px; font-weight: 600; color: #0B0B0B; white-space: nowrap;">
                      ${escapeText(r.name)}
                      ${r.verifiedBuyer ? '<span style="color:#2E7D32; font-size:11px;">✓</span>' : ''}
                    </td>
                    <td style="padding: 12px 14px; font-size: 13px; color: #5E5E59; white-space: nowrap;">${escapeText(r.bookName || r.productId)}</td>
                    <td style="padding: 12px 14px; font-size: 13px; color: #333; max-width: 320px;">
                      "${escapeText(r.comment)}"
                    </td>
                    <td style="padding: 12px 14px; text-align: right;">
                      <button type="button" class="tmz-delete-rev-btn" data-id="${r.id}" style="background: none; border: none; color: #B3261E; font-size: 12px; font-weight: 600; cursor: pointer;">
                        Remove
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
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
      <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 20px; padding: 28px;">
        <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0 0 8px; color: #0B0B0B;">Storefront Announcement Banner</h2>
        <p style="color: #5E5E59; font-size: 14px; margin: 0 0 24px;">Display an eye-catching banner at the very top of your TAMYIZ website for sales, new editions, or notices.</p>

        <form id="tmz-announcement-form">
          <div style="margin-bottom: 18px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="tmz-ann-enabled" ${ann.enabled ? 'checked' : ''} style="width: 18px; height: 18px;" />
              <span style="font-family: var(--font-head); font-weight: 600; font-size: 15px;">Enable Banner on Storefront</span>
            </label>
          </div>

          <div style="margin-bottom: 18px;">
            <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Banner Text *</label>
            <input type="text" id="tmz-ann-text" maxlength="200" value="${escapeText(ann.text || '')}" placeholder="e.g. Ramadhan Special: 20% off all AI Playbooks with code EID20" style="width: 100%; box-sizing: border-box; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(11,11,11,0.2);" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px;">
            <div>
              <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Target URL (Optional)</label>
              <input type="text" id="tmz-ann-link" maxlength="150" value="${escapeText(ann.link || '')}" placeholder="/editions or https://..." style="width: 100%; box-sizing: border-box; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(11,11,11,0.2);" />
            </div>
            <div>
              <label style="display: block; font-family: var(--font-head); font-weight: 600; font-size: 14px; margin-bottom: 6px;">Link Action Label (Optional)</label>
              <input type="text" id="tmz-ann-linktext" maxlength="50" value="${escapeText(ann.linkText || '')}" placeholder="Explore Editions ↗" style="width: 100%; box-sizing: border-box; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(11,11,11,0.2);" />
            </div>
          </div>

          <div id="tmz-ann-msg" style="margin-bottom: 14px; font-size: 14px; font-weight: 500;"></div>

          <button type="submit" id="tmz-save-ann-btn" style="font-family: var(--font-head); font-weight: 600; font-size: 15px; border-radius: 999px; padding: 12px 28px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">
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
        <div style="margin-bottom: 20px;">
          <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0; color: #0B0B0B;">Customers Directory</h2>
          <p style="color: #5E5E59; font-size: 14px; margin: 4px 0 0;">Aggregated buyer profiles with order histories and lifetime value.</p>
        </div>

        ${this.customers.length ? `
          <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; overflow-x: auto; box-shadow: 0 4px 14px rgba(0,0,0,0.03);">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(11,11,11,0.08); background: #F7F7F5;">
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Email / Identifier</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Phone</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Orders Count</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Lifetime Spend</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Last Active</th>
                </tr>
              </thead>
              <tbody>
                ${this.customers.map((c) => `
                  <tr style="border-bottom: 1px solid rgba(11,11,11,0.06);">
                    <td style="padding: 14px 16px; font-weight: 600;">${escapeText(c.email)}</td>
                    <td style="padding: 14px 16px; color: #5E5E59;">${escapeText(c.phone)}</td>
                    <td style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600;">${c.ordersCount}</td>
                    <td style="padding: 14px 16px; font-family: var(--font-head); font-weight: 700;">₹${Number(c.totalSpentINR || 0).toLocaleString('en-IN')}</td>
                    <td style="padding: 14px 16px; font-size: 12px; color: #5E5E59;">
                      ${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 18px; padding: 48px 24px; text-align: center; color: #5E5E59;">
            <p style="margin: 0;">No registered customer profiles found yet.</p>
          </div>
        `}
      </div>
    `;
  }

  // ---------------------------------------------------------------- ANALYTICS TAB
  async renderAnalyticsTab(mount) {
    mount.innerHTML = `
      <div style="background: #0B0B0B; color: #FFFFFF; border-radius: 24px; padding: 28px; box-shadow: 0 30px 60px -30px rgba(0,0,0,0.6);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
          <div>
            <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0; color: #FFFFFF;">Visitor Telemetry</h2>
            <p style="color: #A9A9A3; font-size: 14px; margin: 4px 0 0;">Cloudflare Web Analytics (Cookieless and privacy compliant).</p>
          </div>
          <div style="display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(255,255,255,0.08);">
            <button type="button" class="tmz-stat-range-btn" data-days="1" style="padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; border: none; background: ${this.statsDays === 1 ? '#FFFFFF' : 'transparent'}; color: ${this.statsDays === 1 ? '#0B0B0B' : '#D6D6D1'}; cursor: pointer;">Today</button>
            <button type="button" class="tmz-stat-range-btn" data-days="7" style="padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; border: none; background: ${this.statsDays === 7 ? '#FFFFFF' : 'transparent'}; color: ${this.statsDays === 7 ? '#0B0B0B' : '#D6D6D1'}; cursor: pointer;">7 Days</button>
            <button type="button" class="tmz-stat-range-btn" data-days="30" style="padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; border: none; background: ${this.statsDays === 30 ? '#FFFFFF' : 'transparent'}; color: ${this.statsDays === 30 ? '#0B0B0B' : '#D6D6D1'}; cursor: pointer;">30 Days</button>
          </div>
        </div>

        <div id="tmz-stats-content">
          <p style="color: #A9A9A3;">Connecting to Cloudflare Analytics…</p>
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
        <div style="background: rgba(255,214,140,0.12); color: #FFD98A; padding: 16px; border-radius: 12px; font-size: 14px;">
          ${escapeText(res.data.error || 'Analytics token not active or accessible.')}
        </div>
      `;
      return;
    }

    const d = res.data;
    const num = (n) => Number(n || 0).toLocaleString('en-IN');

    statsBox.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px;">
        <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 20px;">
          <b style="display: block; font-family: var(--font-head); font-size: 40px; font-weight: 700; letter-spacing: -1.5px; color: #FFFFFF;">${num(d.visits)}</b>
          <span style="color: #A9A9A3; font-size: 14px;">Visits in the last ${this.statsDays === 1 ? '24 hours' : `${this.statsDays} days`}</span>
        </div>
        <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 20px;">
          <b style="display: block; font-family: var(--font-head); font-size: 40px; font-weight: 700; letter-spacing: -1.5px; color: #FFFFFF;">${num(d.pageViews)}</b>
          <span style="color: #A9A9A3; font-size: 14px;">Page Views ${d.visits ? `(${((d.pageViews || 0) / (d.visits || 1)).toFixed(1)} per visit)` : ''}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px;">
        <div>
          <h3 style="font-family: var(--font-head); font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #8F8F89; margin: 0 0 12px;">Top Sources</h3>
          ${(d.sources || []).map((s) => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: #EDEDE8;">
              <span>${escapeText(s.name)}</span>
              <strong style="color: #FFFFFF;">${num(s.visits)}</strong>
            </div>
          `).join('')}
        </div>
        <div>
          <h3 style="font-family: var(--font-head); font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #8F8F89; margin: 0 0 12px;">Most Read Pages</h3>
          ${(d.pages || []).filter((p) => !p.path.startsWith('/admin')).slice(0, 6).map((p) => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: #EDEDE8;">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${escapeText(p.path === '/' ? 'Home' : p.path)}</span>
              <strong style="color: #FFFFFF;">${num(p.pageViews)}</strong>
            </div>
          `).join('')}
        </div>
        <div>
          <h3 style="font-family: var(--font-head); font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #8F8F89; margin: 0 0 12px;">Countries</h3>
          ${(d.countries || []).slice(0, 6).map((c) => `
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; color: #EDEDE8;">
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
      <div style="background: #FFFFFF; border: 1px solid rgba(11,11,11,0.1); border-radius: 20px; padding: 28px;">
        <h2 style="font-family: var(--font-head); font-weight: 700; font-size: 22px; margin: 0 0 8px; color: #0B0B0B;">System Diagnostics & Settings</h2>
        <p style="color: #5E5E59; font-size: 14px; margin: 0 0 24px;">Environment variable status and infrastructure health checks.</p>

        <div style="display: grid; gap: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(11,11,11,0.06); padding-bottom: 12px;">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Cloudflare KV Catalog Storage</strong>
              <span style="font-size: 13px; color: #5E5E59;">Binding: TAMYIZ_STORE (1GB free storage)</span>
            </div>
            <span style="background: ${cfg.hasStorage ? '#E3F3E7' : '#FDF1F0'}; color: ${cfg.hasStorage ? '#1E7B2E' : '#8B1A12'}; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;">
              ${cfg.hasStorage ? 'Active & Ready' : 'Disconnected'}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(11,11,11,0.06); padding-bottom: 12px;">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Razorpay Payment Gateway</strong>
              <span style="font-size: 13px; color: #5E5E59;">Key: ${escapeText(cfg.razorpayKeyId || 'None')} ${cfg.isSandbox ? '(SANDBOX MODE ENABLED)' : ''}</span>
            </div>
            <span style="background: ${cfg.hasRazorpay ? '#E3F3E7' : '#FFF2D6'}; color: ${cfg.hasRazorpay ? '#1E7B2E' : '#7A4F00'}; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;">
              ${cfg.hasRazorpay ? 'Configured' : 'Missing Production Keys'}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(11,11,11,0.06); padding-bottom: 12px;">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Receipt Email Dispatcher (Brevo / Resend)</strong>
              <span style="font-size: 13px; color: #5E5E59;">Sender: ${escapeText(cfg.receiptSender || 'tamyiz.co@gmail.com')}</span>
            </div>
            <span style="background: ${cfg.hasBrevo || cfg.hasResend ? '#E3F3E7' : '#FDF1F0'}; color: ${cfg.hasBrevo || cfg.hasResend ? '#1E7B2E' : '#8B1A12'}; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;">
              ${cfg.hasBrevo ? 'Brevo Connected' : cfg.hasResend ? 'Resend Connected' : 'Unconfigured'}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(11,11,11,0.06); padding-bottom: 12px;">
            <div>
              <strong style="font-family: var(--font-head); font-size: 15px; display: block;">Signed Digital Asset Vault</strong>
              <span style="font-size: 13px; color: #5E5E59;">Time-expiring HMAC signed download links</span>
            </div>
            <span style="background: #E3F3E7; color: #1E7B2E; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px;">
              Secured (1-Year Tokens)
            </span>
          </div>
        </div>
      </div>
    `;
  }
}
