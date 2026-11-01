/**
 * TAMYIZ™ Unified Admin Dashboard Controller
 * Modern minimal, responsive SaaS console embedded directly in the unified SPA.
 * Handles:
 *   - Overview (Live KPIs, revenue, real orders, Cloudflare visitor insights)
 *   - Products (CRUD, auto thumbnail generator, PDF upload, status controls)
 *   - Orders (Searchable, filterable order table, customer info, fulfillment)
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
    this.activeTab = 'overview'; // 'overview' | 'products' | 'orders' | 'customers' | 'analytics' | 'settings'
    this.editingProduct = null;
    this.coverBlob = null;
    this.thumbBlob = null;
    this.products = [];
    this.orders = [];
    this.customers = [];
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
    this.activeTab = ['products', 'orders', 'customers', 'analytics', 'settings'].includes(subRoute) ? subRoute : 'overview';

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
    // Update tab bar buttons
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
            <button id="tmz-action-view-orders" type="button" style="text-align: left; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(11,11,11,0.12); background: #F7F7F5; font-family: var(--font-head); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.15s ease;">
              Inspect Recent Customer Orders ↗
            </button>
            <button id="tmz-action-view-analytics" type="button" style="text-align: left; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(11,11,11,0.12); background: #F7F7F5; font-family: var(--font-head); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.15s ease;">
              Check Web Traffic & Visitors ↗
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
    document.getElementById('tmz-action-view-orders')?.addEventListener('click', () => this.switchTab('orders'));
    document.getElementById('tmz-action-view-analytics')?.addEventListener('click', () => this.switchTab('analytics'));
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
            <p style="color: #5E5E59; font-size: 14px; margin: 4px 0 0;">Customer transactions and verified digital delivery records.</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="tmz-order-search" placeholder="Search reference, email, phone…" value="${escapeText(this.orderSearchQuery)}" style="padding: 10px 14px; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 999px; font-size: 14px; min-width: 260px;" />
            <button id="tmz-order-search-btn" type="button" style="font-family: var(--font-head); font-weight: 600; font-size: 13px; padding: 10px 18px; border-radius: 999px; border: none; background: #0B0B0B; color: #FFFFFF; cursor: pointer;">Search</button>
          </div>
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
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Status</th>
                  <th style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #5E5E59;">Date</th>
                </tr>
              </thead>
              <tbody>
                ${this.orders.map((o) => `
                  <tr style="border-bottom: 1px solid rgba(11,11,11,0.06);">
                    <td style="padding: 14px 16px; font-family: var(--font-head); font-weight: 600;">
                      ${escapeText(o.referenceId || o.orderId)}
                      <span style="display: block; font-size: 11px; color: #5E5E59; font-weight: 400;">${escapeText(o.paymentId || '')}</span>
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
                      <span style="background: #E3F3E7; color: #1E7B2E; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; text-transform: uppercase;">
                        ${escapeText(o.status || 'paid')}
                      </span>
                    </td>
                    <td style="padding: 14px 16px; font-size: 12px; color: #5E5E59;">
                      ${o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent'}
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

    const searchInput = document.getElementById('tmz-order-search');
    const searchBtn = document.getElementById('tmz-order-search-btn');
    const triggerSearch = () => {
      this.orderSearchQuery = searchInput.value;
      this.renderOrdersTab(mount);
    };
    searchBtn.addEventListener('click', triggerSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerSearch();
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

