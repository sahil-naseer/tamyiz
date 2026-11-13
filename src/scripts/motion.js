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
 * Parts: scroll reveals · line drawings that draw themselves · the pinned "How we write" steps ·
 * the dot grid behind the hero · numbers that count up · the leaning book covers · the progress line.
 *
 * Smoothness rule (measured 14 Nov 2026): NOTHING loops forever. Every animation here runs once and stops,
 * or runs only while the visitor is scrolling or moving the mouse. An idle page must do no work at all.
 */

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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
  ['.tmz-home-film-lead', false],
  ['.tmz-home-film-side-card', true],
  ['.tmz-film-card', true],
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
let counted = false;
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
    if (el.closest('.is-pinned')) return; // the pinned steps draw the active step themselves
    el.dataset.drawSeen = '';
    if (sinceNav() > 1500 && inView(el)) { el.classList.add('is-drawn', 'is-instant'); return; }
    drawIo.observe(el);
  });
}

/** Everything that came into view together is revealed together, and tidied up together (one timer, one restyle). */
function reveal(els) {
  for (const el of els) { io.unobserve(el); el.classList.add('is-in'); }
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

/** Hero numbers count up once (the real number is already in the markup, so nothing is lost without this). */
function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    delete el.dataset.count;
    if (!(end > 0) || !el.firstChild) return;
    const text = el.firstChild; // changing the text node (not the element) keeps the page observer quiet
    const start = performance.now() + 700;
    const dur = 1100;
    const step = (now) => {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      text.nodeValue = Math.round(end * (1 - Math.pow(1 - t, 4))).toLocaleString('en-IN');
      if (t < 1) requestAnimationFrame(step);
    };
    text.nodeValue = '0';
    requestAnimationFrame(step);
  });
}

/**
 * The dot grid behind the hero. The grid itself is a still CSS background (free). This canvas only adds
 * the dots that swell near the mouse, and only draws while the mouse is moving: nothing here runs on
 * touch screens, when the pointer rests, or once the hero is off screen. (An earlier version redrew
 * every dot on every frame; it cost more than half the frame budget on a slow machine.)
 */
let dotsStop = null;
function dotGrid() {
  const canvas = document.querySelector('.tmz-dots');
  if (!canvas || canvas.dataset.on) return;
  canvas.dataset.on = '1';
  if (dotsStop) dotsStop();
  if (!fine() || reduce()) return;
  const host = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const GAP = 22;      // must match the CSS grid (background-size on .tmz-hero)
  const REACH = 170;
  let w = 0, h = 0, raf = 0, dirty = null;
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: false };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const size = () => {
    w = host.clientWidth; h = host.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = null;
  };
  const draw = () => {
    raf = 0;
    if (dirty) ctx.clearRect(dirty[0], dirty[1], dirty[2], dirty[3]);
    dirty = null;
    if (!pointer.on) return;
    pointer.x += (pointer.tx - pointer.x) * 0.22;
    pointer.y += (pointer.ty - pointer.y) * 0.22;
    const x0 = Math.max(0, Math.floor((pointer.x - REACH) / GAP)), x1 = Math.min(Math.ceil(w / GAP), Math.ceil((pointer.x + REACH) / GAP));
    const y0 = Math.max(0, Math.floor((pointer.y - REACH) / GAP)), y1 = Math.min(Math.ceil(h / GAP), Math.ceil((pointer.y + REACH) / GAP));
    ctx.fillStyle = '#000';
    for (let gy = y0; gy < y1; gy += 1) {
      for (let gx = x0; gx < x1; gx += 1) {
        const x = gx * GAP + GAP / 2, y = gy * GAP + GAP / 2;
        const near = 1 - Math.hypot(x - pointer.x, y - pointer.y) / REACH;
        if (near <= 0) continue;
        const s = 1.6 + near * near * 3.4;
        ctx.globalAlpha = near * 0.6;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    dirty = [x0 * GAP - 4, y0 * GAP - 4, (x1 - x0) * GAP + 8, (y1 - y0) * GAP + 8];
    // keep going only while the dots are still catching up with the mouse
    if (Math.abs(pointer.tx - pointer.x) > 0.5 || Math.abs(pointer.ty - pointer.y) > 0.5) raf = requestAnimationFrame(draw);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };

  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    pointer.tx = e.clientX - r.left; pointer.ty = e.clientY - r.top;
    if (!pointer.on) { pointer.on = true; pointer.x = pointer.tx; pointer.y = pointer.ty; }
    kick();
  };
  const onLeave = () => { pointer.on = false; kick(); };
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave);
  dotsStop = () => { cancelAnimationFrame(raf); ro.disconnect(); dotsStop = null; };
}

/**
 * "How we write" on a laptop: the section stays put while you scroll and steps 01 → 02 → 03.
 * Needs room (1024px wide, 640px tall) and motion allowed; otherwise the three cards just sit side by side.
 */
let stepsBound = false;
// Asked once and again only when the window changes size: reading the window's size on every redraw forced the
// browser to lay the whole page out early (about 50 ms on a slow phone, measured 14 Nov 2026).
const roomToPin = window.matchMedia('(min-width: 1024px) and (min-height: 640px)');
function steps() {
  const canPin = () => !reduce() && roomToPin.matches;
  const update = () => {
    document.querySelectorAll('[data-steps]').forEach((section) => {
      const pin = canPin();
      if (section.classList.contains('is-pinned') !== pin) {
        section.classList.toggle('is-pinned', pin);
        if (!pin) {
          section.querySelectorAll('.tmz-step').forEach((li) => li.classList.remove('is-active', 'is-past'));
          section.querySelectorAll('[data-draw]').forEach((art) => { art.dataset.drawSeen = ''; art.classList.add('is-drawn', 'is-instant'); });
        }
        delete section.dataset.active;
      }
      if (!pin) return;
      const track = section.querySelector('.tmz-steps-track');
      const pinEl = section.querySelector('.tmz-steps-pin');
      const items = [...section.querySelectorAll('.tmz-step')];
      if (!track || !pinEl || !items.length) return;
      const r = track.getBoundingClientRect();
      const travel = r.height - pinEl.offsetHeight;
      if (section._pinTop === undefined) section._pinTop = parseFloat(getComputedStyle(pinEl).top) || 0;
      const top = section._pinTop;
      const progress = travel > 0 ? Math.max(0, Math.min(1, (top - r.top) / travel)) : 0;
      const index = Math.min(items.length - 1, Math.floor(progress * items.length));
      const bar = section.querySelector('.tmz-steps-bar > i');
      if (bar) bar.style.transform = `scaleX(${((index + Math.min(1, progress * items.length - index)) / items.length).toFixed(3)})`;
      const seen = r.top < window.innerHeight * 0.7; // the drawing waits until the section is really on screen
      const key = `${index}:${seen}`;
      if (section.dataset.active === key) return;
      section.dataset.active = key;
      items.forEach((li, i) => {
        li.classList.toggle('is-active', i === index);
        li.classList.toggle('is-past', i < index);
        const art = li.querySelector('[data-draw]');
        if (art) { art.classList.remove('is-instant'); art.classList.toggle('is-drawn', seen && i === index); }
      });
      const count = section.querySelector('.tmz-steps-count b');
      if (count && count.firstChild) count.firstChild.nodeValue = `0${index + 1}`;
    });
  };
  if (!stepsBound) {
    stepsBound = true;
    let queued = false;
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }
  update();
}

/** Laptop only: the book cover leans a few degrees toward the pointer. */
function tilt() {
  if (!fine() || reduce()) return;
  let current = null;
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest ? e.target.closest('.tamyiz-product-thumb') : null;
    if (current && current !== el) { current.style.removeProperty('--tx'); current.style.removeProperty('--ty'); }
    current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--tx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--ty', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }, { passive: true });
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
}

export function initMotion() {
  const app = document.getElementById('app');
  if (!app || !('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
  scrollChrome();
  tilt();
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
    if (window.location.pathname !== navPath) { navPath = window.location.pathname; navStart = performance.now(); counted = false; }
    document.documentElement.style.setProperty('--mo-t', `${Math.round(Math.min(sinceNav(), 20000))}ms`);
    dotGrid();
    if (still) return;
    steps();
    tag(app);
    // Laptops only: every tick changes the text, which is layout work a slow phone should not spend on a flourish.
    if (!counted && fine() && app.querySelector('[data-count]')) { counted = true; countUp(app); }
  };
  new MutationObserver(scan).observe(app, { childList: true, subtree: true });
  scan();
}
