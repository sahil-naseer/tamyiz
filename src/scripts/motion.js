/**
 * TAMYIZ motion layer (14 Nov 2026).
 *
 * Everything here is decoration: the page works the same without it.
 *  - Content is only hidden for a reveal after this file has run (class `mo` on <html>), so a script
 *    error or a blocked script can never leave the page blank.
 *  - "Reduce motion" on the visitor's device switches all of it off (CSS and JS).
 *  - Only opacity, transform and line drawing are animated (no layout shift).
 *  - The app draws pages with innerHTML, so one MutationObserver re-scans after every draw.
 *
 * Parts: scroll reveals · line drawings that draw themselves · the progress line. The hero's staggered
 * entrance is pure CSS (tamyiz-unified.css, "CALM 25 Nov 2026"). The hero drawing's scroll parallax was
 * removed 26 Nov 2026 (it pushed the drawing into the hero's clipped edge).
 * Removed 25 Nov 2026 to keep the site calm: the mouse-following dot grid, covers leaning toward the
 * mouse, count-up numbers and the pinned "How we write" scroll section.
 *
 * Smoothness rule (measured 14 Nov 2026): NOTHING loops forever. Every animation here runs once and stops,
 * or runs only while the visitor is scrolling or moving the mouse. An idle page must do no work at all.
 */

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** What slides in on scroll. `group` = the children arrive one after another. */
const REVEAL = [
  ['.tmz-founders-head', false],
  ['.tmz-about-people figure', true],
  ['.tmz-founders .tmz-about-foot', false],
  ['.tamyiz-promise-item', true],
  ['.tamyiz-shop-header', false],
  ['.tamyiz-section-head', false],
  ['.tamyiz-product-card', true],
  ['.tmz-card-skeleton', true],
  ['.tmz-step', true],
  ['.tamyiz-matrix-card', true],
  ['.tamyiz-section-foot', false],
  ['.tmz-closing .container > *', true],
  ['.tamyiz-page-header .container > *', true],
  ['.tmz-about section', false],
  ['.tamyiz-footer-grid > *', true],
  ['.tmz-footer-giant', false],
];

let io = null;        // scroll reveals
let drawIo = null;    // line drawings
let navPath = null;   // the address the current page-arrival animation belongs to
let navStart = 0;
const sinceNav = () => performance.now() - navStart;
const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };

function tag(root) {
  for (const [selector, group] of REVEAL) {
    const counters = new Map();
    root.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.mo !== undefined || el.dataset.moDone !== undefined) return;
      // The same page drawn again (bag changed, coupon applied...): what is already on screen stays put.
      if (sinceNav() > 1500 && inView(el)) { el.dataset.moDone = ''; return; }
      let i = 0;
      if (group) {
        i = counters.get(el.parentElement) || 0;
        counters.set(el.parentElement, i + 1);
      }
      el.style.setProperty('--mo-i', Math.min(i, 6));
      el.dataset.mo = '';
      io.observe(el);
    });
  }
  // Line drawings: hidden until they scroll into view, then each line draws itself.
  root.querySelectorAll('[data-draw]:not([data-draw-seen])').forEach((el) => {
    el.dataset.drawSeen = '';
    if (sinceNav() > 1500 && inView(el)) { el.classList.add('is-drawn', 'is-instant'); return; }
    // The hero's drawing belongs to the first screen: it starts on arrival instead of waiting to be scrolled to
    // (26 Nov 2026: on short laptop screens it used to stay blank). Two frames, so its starting state is painted first.
    if (el.closest('.tmz-hero')) {
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-drawn')));
      return;
    }
    drawIo.observe(el);
  });
}

/** Everything that came into view together is revealed together, and tidied up together (one timer, one restyle). */
function reveal(els) {
  for (const el of els) {
    io.unobserve(el);
    el.classList.add('is-in');
    el.addEventListener('pointerenter', () => el.style.removeProperty('--mo-i'), { once: true, passive: true });
  }
  // Afterwards the elements go back to their own hover transitions (a leftover delay would make hovers feel late).
  setTimeout(() => {
    for (const el of els) {
      delete el.dataset.mo;
      el.dataset.moDone = '';
      el.classList.remove('is-in');
      el.style.removeProperty('--mo-i');
    }
  }, 1400);
}

/** Thin reading-progress line at the top, and a soft header shadow once the page is scrolled. */
function scrollChrome() {
  const bar = document.createElement('div');
  bar.className = 'tmz-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let queued = false;
  const update = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    document.documentElement.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', ask, { passive: true });
  ask(); // not straight away: measuring the page before it has settled would force an extra layout
  return ask;
}

export function initMotion() {
  const app = document.getElementById('app');
  if (!app || !('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
  const askScroll = scrollChrome();
  const still = reduce();
  if (!still) {
    io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).map((e) => e.target);
      if (seen.length) reveal(seen);
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    drawIo = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { drawIo.unobserve(e.target); e.target.classList.add('is-drawn'); }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    document.documentElement.classList.add('mo');
  }
  // Runs right after every draw, before the browser paints it (so nothing flashes in and then hides).
  const scan = () => {
    if (window.location.pathname !== navPath) { navPath = window.location.pathname; navStart = performance.now(); }
    document.documentElement.style.setProperty('--mo-t', `${Math.round(Math.min(sinceNav(), 20000))}ms`);
    askScroll();
    if (still) return;
    tag(app);
  };
  new MutationObserver(scan).observe(app, { childList: true, subtree: true });
  scan();
}
