/**
 * Sections shared by the home page and /philosophy, so the two never disagree:
 * how the e-books are made, and how to read them on each device.
 */

import { stepArt } from '../illustrations.js';

const kicker = (text) => `<span class="tmz-label">${text}</span>`;

const promises = [
  ['Practical, not padded', 'Every chapter ends with something you can do today. No filler written to reach a page count.'],
  ['Plain English', 'Written for beginners, with real examples and short sections that read easily on a phone.'],
  ['Yours instantly', 'A DRM-free PDF you download right after paying. Keep it, read it on any device, print the pages you need.'],
];

/**
 * "How we write": three promises. Plain markup = three cards side by side (stacked on phones).
 * On a laptop the motion layer pins the section and steps 01 → 02 → 03 as you scroll (see `steps()` in motion.js).
 */
export function principlesSection({ id = '', withButton = true } = {}) {
  return `
      <section ${id ? `id="${id}"` : ''} class="tamyiz-section tmz-steps scroll-mt-24" data-steps>
        <div class="tmz-steps-track">
          <div class="tmz-steps-pin">
            <div class="container">
              <div class="tamyiz-section-head tmz-steps-head">
                ${kicker('How we write')}
                <h2 class="tamyiz-section-title">Three promises in every book</h2>
                <p class="tamyiz-section-sub">Short, clear and useful. If a page doesn't help you do something, it doesn't go in.</p>
              </div>
              <div class="tmz-steps-stage">
              <div class="tmz-steps-meta" aria-hidden="true">
                <span>Our promise</span>
                <span class="tmz-steps-count"><b>01</b> / 0${promises.length}</span>
                <i class="tmz-steps-bar"><i></i></i>
              </div>
              <ol class="tmz-steps-list">
                ${promises.map(([title, text], i) => `
                <li class="tmz-step${i === 0 ? ' is-active' : ''}">
                  <div class="tmz-frame tmz-step-art" data-draw>${stepArt[i]()}</div>
                  <div class="tmz-step-copy">
                    <span class="tmz-step-num" aria-hidden="true">0${i + 1}</span>
                    <h3 class="tmz-step-title">${title}</h3>
                    <p class="tmz-step-desc">${text}</p>
                  </div>
                </li>`).join('')}
              </ol>
              </div>
            </div>
          </div>
        </div>
        ${withButton ? `
        <div class="container">
          <div class="tamyiz-section-foot">
            <a class="tamyiz-btn-nav-outline" href="/#format-guide" onclick="event.preventDefault(); window.tamyizApp.navigateTo('/#format-guide')">
              <span>How to read on your device</span>
              <span>→</span>
            </a>
          </div>
        </div>` : ''}
      </section>`;
}

const tag = (t) => `<span class="comp-tag active">${t} ✓</span>`;
const card = (icon, title, sub, text, tags) => `
            <div class="tamyiz-matrix-card">
              <div class="matrix-card-header">
                <span class="matrix-icon" aria-hidden="true">${icon}</span>
                <div>
                  <h3>${title}</h3>
                  <span class="matrix-sub">${sub}</span>
                </div>
              </div>
              <p class="matrix-desc">${text}</p>
              <div class="matrix-compatibility-tags">${tags.map(tag).join('')}</div>
            </div>`;

const svg = (paths) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export function formatGuideSection({ id = 'format-guide' } = {}) {
  return `
      <section id="${id}" class="tamyiz-section tmz-formats py-14 md:py-24 scroll-mt-24">
        <div class="container">
          <div class="tamyiz-section-head">
            ${kicker('Format guide')}
            <h2 class="tamyiz-section-title">Read it anywhere</h2>
            <p class="tamyiz-section-sub">Every TAMYIZ e-book is a DRM-free PDF. It works on the devices you already own, with nothing extra to install.</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            ${card(svg('<rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18" stroke-width="2"></line>'),
              'Phone &amp; tablet', 'Opens in a tap',
              'Open it in Files, Apple Books, Google Drive or any PDF reader. Pinch to zoom on diagrams.',
              ['iPhone', 'Android', 'iPad'])}
            ${card(svg('<rect x="2" y="4" width="20" height="13" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>'),
              'Laptop &amp; desktop', 'Read or print',
              'Read it in your browser, in Preview on a Mac or in Adobe Acrobat. Print just the pages you want.',
              ['Chrome / Edge', 'Mac Preview', 'Acrobat'])}
            ${card(svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'),
              'Kindle', 'Send to Kindle',
              "Email the PDF to your Kindle with Amazon's free Send to Kindle, and it shows up in your library.",
              ['Kindle devices', 'Kindle app'])}
          </div>
        </div>
      </section>`;
}
