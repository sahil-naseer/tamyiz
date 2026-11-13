/**
 * TAMYIZ™ About us
 * Route: /atelier (kept: Razorpay has this address on file as the About page)
 *
 * Plain words only: who we are, why we started, what the name means, the two founders, how to reach us.
 * Founder facts come from site-config.js; portraits are the matched crops used on the home page.
 */

import { siteConfig } from '../../data/site-config.js';
import { products } from '../../data/products.js';

function founderCard(f, portrait) {
  const links = [
    ['Instagram', f.socials.instagram],
    ['LinkedIn', f.socials.linkedin],
    ['X', f.socials.x],
    f.email ? ['Email', `mailto:${f.email}`] : null,
  ].filter(Boolean);
  return `
    <article class="tmz-person">
      <div class="tmz-person-head">
        <img src="${portrait}" alt="${f.fullName}" width="480" height="600" loading="lazy" decoding="async" />
        <div class="tmz-person-ident">
          <h3>${f.fullName}</h3>
          <p class="tmz-person-role">${f.role.replace('Co-Founder • ', 'Co-founder · ')}</p>
        </div>
      </div>
      <div class="tmz-person-body">
        <p class="tmz-person-bio">${f.bio}</p>
        <blockquote>${f.quote}</blockquote>
        <ul class="tmz-person-links">
          ${links.map(([label, href]) => `<li><a href="${href}"${href.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${label} <span aria-hidden="true">↗</span></a></li>`).join('')}
        </ul>
      </div>
    </article>`;
}

export function renderAtelierPage(appInstance) {
  const { basit, sahil } = siteConfig.founders;
  const count = products.length;

  return `
    <div class="tmz-about">
      <section class="tmz-about-intro">
        <div class="tmz-wrap">
          <h1>About us</h1>
          <p class="tmz-about-lede">TAMYIZ is two people, Basit and Sahil, writing the clear, practical guides we wished we'd had.</p>
        </div>
      </section>

      <section class="tmz-about-people-section" aria-labelledby="founders-title">
        <div class="tmz-wrap">
          <h2 id="founders-title">The founders</h2>
          <div class="tmz-people-grid">
            ${founderCard(basit, '/assets/images/founders/basit-portrait.webp')}
            ${founderCard(sahil, '/assets/images/founders/sahil-portrait.webp')}
          </div>
        </div>
      </section>

      <section class="tmz-about-story">
        <div class="tmz-wrap tmz-about-story-grid">
          <div class="tmz-about-text">
            <h2>Why we started</h2>
            <p>We started TAMYIZ in late 2025. Basit works in cybersecurity and research; Sahil works in artificial intelligence and machine learning. Between us, we kept seeing the same thing: complex subjects being made harder than they need to be, with nobody explaining them in plain language.</p>
            <p>So we write short e-books that do exactly that. Every chapter ends with something you can do today. No filler, no jargon, and a PDF you can read on any device.</p>
          </div>
          <aside class="tmz-about-facts" aria-label="TAMYIZ at a glance">
            <p class="tmz-about-meaning"><strong>Tamyiz</strong> (<span lang="ar">تمييز</span>) means the ability to tell things apart: a good source from a fake one, a real message from a scam, a vague question from a clear one.</p>
            <dl>
              <div><dt>Founded</dt><dd>${siteConfig.founded}</dd></div>
              <div><dt>Founders</dt><dd>Basit Majeed and Sahil Naseer</dd></div>
              <div><dt>What we make</dt><dd>${count ? `${count} practical e-book${count === 1 ? '' : 's'} (PDF)` : 'Practical e-books (PDF)'}</dd></div>
              <div><dt>Talk to us</dt><dd><a href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer">WhatsApp ${siteConfig.phone}</a></dd></div>
            </dl>
          </aside>
        </div>
      </section>

      <section class="tmz-about-contact" id="contact-form-section" aria-labelledby="contact-title">
        <div class="tmz-wrap tmz-about-contact-grid" id="atelier-contact-container">
          <div>
            <h2 id="contact-title">Get in touch</h2>
            <p>A question about an e-book, an order or a refund? Write it here and it opens in WhatsApp, ready to send. Or email <a href="mailto:${siteConfig.email}">${siteConfig.email}</a>.</p>
            <p class="tmz-about-reply">We reply ourselves, usually within a day.</p>
          </div>

          <form class="tamyiz-contact-form tmz-contact-form" id="atelier-contact-form" onsubmit="event.preventDefault(); window.tamyizApp.handleContactSubmit();">
            <div class="tmz-field-row">
              <div>
                <label class="tamyiz-form-label" for="contact-name">Your name</label>
                <input type="text" id="contact-name" required autocomplete="name" class="tamyiz-form-input" />
              </div>
              <div>
                <label class="tamyiz-form-label" for="contact-email">Email</label>
                <input type="email" id="contact-email" required autocomplete="email" class="tamyiz-form-input" />
              </div>
            </div>
            <div>
              <label class="tamyiz-form-label" for="contact-subject">About</label>
              <select id="contact-subject" class="tamyiz-form-input">
                <option value="A question about an e-book">A question about an e-book</option>
                <option value="An order or a refund">An order or a refund</option>
                <option value="Feedback">Feedback</option>
                <option value="Something else">Something else</option>
              </select>
            </div>
            <div>
              <label class="tamyiz-form-label" for="contact-message">Message</label>
              <textarea id="contact-message" rows="4" required class="tamyiz-form-input"></textarea>
            </div>
            <div class="tmz-contact-actions">
              <button type="submit" class="tmz-btn tmz-btn-solid" id="contact-submit-btn">Send on WhatsApp</button>
              <a href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="tmz-btn tmz-btn-line">Open WhatsApp chat</a>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;
}
