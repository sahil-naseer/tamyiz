/**
 * TAMYIZ™ Customer Download & Library Recovery Portal
 * Route: /downloads or /orders
 */

export function renderDownloadsPage(appInstance) {
  return `
    <div class="tmz-downloads-page" style="padding: 3rem 1rem 6rem; max-width: 680px; margin: 0 auto; min-height: 60vh;">
      <div style="text-align: center; margin-bottom: 2.5rem;">
        <span style="font-family: var(--font-sub); font-size: 0.74rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-red-ink); display: inline-block; margin-bottom: 0.4rem;">
          Lost your file?
        </span>
        <h1 style="font-family: var(--font-head); font-weight: 700; font-size: 2.2rem; line-height: 1.15; margin: 0 0 0.75rem; color: #0B0B0B;">
          Get your download links again
        </h1>
        <p style="font-size: 0.95rem; color: #5E5E59; line-height: 1.5; margin: 0;">
          Lost your file or your receipt email? Enter the email or mobile number you used at checkout. We will email fresh download links to the email address on your order.
        </p>
      </div>

      <!-- Recovery Card Form -->
      <div style="background: #FFFFFF; border: 1.5px solid rgba(11,11,11,0.12); border-radius: 16px; padding: 2rem 1.75rem; box-shadow: 0 4px 20px rgba(0,0,0,0.03); margin-bottom: 2rem;">
        <form id="tmz-recovery-form" onsubmit="window.tamyizApp.submitDownloadRecovery(event)" style="display: flex; flex-direction: column; gap: 1rem;">
          <div>
            <label for="recovery-input-email" style="display: block; font-family: var(--font-head); font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; color: #0B0B0B;">
              Your Purchase Email Address
            </label>
            <input
              type="email"
              id="recovery-input-email"
              placeholder="e.g. name@gmail.com"
              style="width: 100%; box-sizing: border-box; padding: 0.85rem 1rem; font-size: 0.95rem; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 8px; outline: none; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='#0B0B0B'"
              onblur="this.style.borderColor='rgba(11,11,11,0.2)'"
            />
          </div>

          <div style="text-align: center; position: relative; margin: 0.2rem 0;">
            <span style="background: #FFFFFF; padding: 0 0.75rem; font-size: 0.75rem; font-family: monospace; color: #5E5E59; position: relative; z-index: 1;">OR VIA MOBILE / WHATSAPP</span>
            <div style="position: absolute; top: 50%; left: 0; right: 0; border-top: 1px solid rgba(11,11,11,0.08); z-index: 0;"></div>
          </div>

          <div>
            <label for="recovery-input-phone" style="display: block; font-family: var(--font-head); font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; color: #0B0B0B;">
              Mobile / WhatsApp Number
            </label>
            <input
              type="tel"
              id="recovery-input-phone"
              placeholder="e.g. +91 98765 43210"
              style="width: 100%; box-sizing: border-box; padding: 0.85rem 1rem; font-size: 0.95rem; border: 1.5px solid rgba(11,11,11,0.2); border-radius: 8px; outline: none; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='#0B0B0B'"
              onblur="this.style.borderColor='rgba(11,11,11,0.2)'"
            />
          </div>

          <div id="recovery-msg-box" style="display: none; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.88rem; line-height: 1.4;"></div>

          <button
            type="submit"
            id="recovery-submit-btn"
            style="width: 100%; padding: 0.95rem 1.5rem; background: #0B0B0B; color: #FFFFFF; font-family: var(--font-head); font-weight: 700; font-size: 0.92rem; letter-spacing: 0.05em; text-transform: uppercase; border: none; border-radius: 8px; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem;"
            onmouseover="this.style.background='#222'"
            onmouseout="this.style.background='#0B0B0B'"
          >
            <span>Email me my download links →</span>
          </button>
        </form>
      </div>

      <!-- Recovery Results Container -->
      <div id="recovery-results-container" style="display: none;"></div>

      <!-- Assistance Footer -->
      <div style="background: #FAF9F6; border: 1px dashed rgba(11,11,11,0.15); border-radius: 12px; padding: 1.25rem 1.5rem; text-align: center;">
        <p style="font-size: 0.85rem; color: #5E5E59; margin: 0 0 0.5rem;">
          Still cannot find your purchase or paid through a different gateway?
        </p>
        <a href="https://wa.me/919541722379?text=Hi%20TAMYIZ,%20I%20need%20help%20recovering%20my%20e-book%20order" target="_blank" rel="noopener noreferrer" style="font-size: 0.85rem; font-weight: 700; color: #0B0B0B; text-decoration: underline;">
          WhatsApp us (+91 95417 22379) ↗
        </a>
      </div>
    </div>
  `;
}

