/**
 * TAMYIZ™ /philosophy: how the e-books are written, how to read them, and common questions.
 * The first two sections are shared with the home page (sections.js).
 */

import { faqs } from '../../data/content.js';
import { siteConfig } from '../../data/site-config.js';
import { principlesSection, formatGuideSection } from './sections.js';

export function renderPhilosophyPage(appInstance) {
  return `
    <div class="tamyiz-page-philosophy">
      <section class="tamyiz-page-header">
        <div class="container">
          <div class="tamyiz-page-header-inner">
            <span class="tamyiz-page-badge">How we work</span>
            <h1 class="tamyiz-page-title">Our approach &amp; format guide</h1>
            <p class="tamyiz-page-description">
              What goes into every TAMYIZ e-book, how to read it on your devices, and answers to common questions.
            </p>
          </div>
        </div>
      </section>

      ${principlesSection({ withButton: false })}

      ${formatGuideSection({ id: 'formats' })}

      <section class="tamyiz-section py-14 md:py-24" style="background: #FFFFFF;">
        <div class="container">
          <div class="tamyiz-section-head">
            <span style="color: var(--color-red-ink); font-family: var(--font-sub); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; display: inline-block; margin-bottom: 0.5rem;">Questions</span>
            <h2 class="tamyiz-section-title">Frequently asked questions</h2>
          </div>

          <div class="tamyiz-faq-accordion-stack max-w-3xl mx-auto">
            ${faqs.map((faq, i) => `
              <div class="tamyiz-faq-item ${i === 0 ? 'open' : ''}" id="faq-${i}">
                <button class="tamyiz-faq-trigger" aria-expanded="${i === 0 ? 'true' : 'false'}" data-action="toggle-faq" data-arg="faq-${i}">
                  <span class="tamyiz-faq-question">${faq.q}</span>
                  <span class="tamyiz-faq-icon" aria-hidden="true">${i === 0 ? '−' : '+'}</span>
                </button>
                <div class="tamyiz-faq-answer">
                  <p>${faq.a}</p>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="tamyiz-section-foot">
            <p style="font-size: 0.95rem; color: #555; margin-bottom: 1rem;">Didn't find your answer?</p>
            <a class="tamyiz-btn-nav-outline" href="${siteConfig.whatsappUrl}" target="_blank" rel="noopener noreferrer">
              <span>Ask us on WhatsApp</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  `;
}
