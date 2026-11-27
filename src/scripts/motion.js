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
 * Removed 25 Nov 2026 to keep the site calm: covers leaning toward the mouse, count-up numbers and the
 * pinned "How we write" scroll section. The mouse-following dot grid behind the hero was removed then too and
 * brought back 27 Nov 2026 (Sahil asked for it); it runs only on mouse screens and only while the mouse moves.
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
  ['.tmz-closing .container > *', true],
  ['.tamyiz-page-header .container > *', true],
  ['.tmz-about section', false],
  ['.tamyiz-footer-grid > *', true],
  ['.tmz-footer-giant', false],
];

let io = null;        // scroll reveals
const fresh = new WeakSet(); // reveals whose first IntersectionObserver report has not come in yet
let drawIo = null;    // line drawings
let navPath = null;   // the address the current page-arrival animation belongs to
let navStart = 0;
const sinceNav = () => performance.now() - navStart;
let firstPreScan = false; // true during the first scan of home's ready-made page (index.html, html.pre)
const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };

function tag(root) {
  for (const [selector, group] of REVEAL) {
    const counters = new Map();
    root.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.mo !== undefined || el.dataset.moDone !== undefined) return;
      // The same page drawn again (bag changed, coupon applied...), or home's ready-made first screen
      // (html.pre, already painted before this ran): what is already on screen stays put.
      if ((sinceNav() > 1500 || firstPreScan) && inView(el)) { el.dataset.moDone = ''; return; }
      let i = 0;
      if (group) {
        i = counters.get(el.parentElement) || 0;
        counters.set(el.parentElement, i + 1);
      }
      el.style.setProperty('--mo-i', Math.min(i, 6));
      el.dataset.mo = '';
      fresh.add(el);
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

/**
 * Already on the first screen when the page opens: shown at once, no fade (26 Nov 2026). On phones the
 * "About us" paragraph peeks in under the hero, and Chrome counts a faded-in element as painted only when its
 * fade ends, so the fade made it the page's late Largest Contentful Paint (about 0.9 s later, Lighthouse).
 * Decided from the IntersectionObserver's first report, so no layout is read here.
 */
function showNow(els) {
  for (const el of els) {
    io.unobserve(el);
    delete el.dataset.mo;
    el.dataset.moDone = '';
    el.style.removeProperty('--mo-i');
  }
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

/**
 * The dot grid behind the hero. The grid itself is a still CSS background (free). This canvas only adds
 * the dots that swell near the mouse, and only draws while the mouse is moving: nothing here runs on
 * touch screens, when the pointer rests, or once the hero is off screen. (An earlier version redrew
 * every dot on every frame; it cost more than half the frame budget on a slow machine.)
 */
let dotsStop = null;
function dotGrid() {
  const canvas = document.querySelector('.tmz-dots');
  if (!canvas) {
    if (dotsStop) dotsStop();
    return;
  }
  if (canvas.dataset.on) return;
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
  dotsStop = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerleave', onLeave);
    dotsStop = null;
  };
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
      const arriving = sinceNav() < 1500;
      const now = [], later = [];
      for (const e of entries) {
        const first = fresh.delete(e.target);
        if (e.isIntersecting) (first && arriving ? now : later).push(e.target);
      }
      if (now.length) showNow(now);
      if (later.length) reveal(later);
    // Starts 160px BEFORE the element reaches the screen, so it is finished by the time it is seen
    // (27 Nov 2026, Sahil: sections showed half-faded while only partly on screen).
    }, { rootMargin: '0px 0px 160px 0px', threshold: 0 });
    drawIo = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { drawIo.unobserve(e.target); e.target.classList.add('is-drawn', 'is-instant'); }
    // Line drawings outside the home hero appear complete just before they scroll in (they took ~1.7 s to draw
    // themselves and were seen half-drawn). Only the hero's drawing still draws itself.
    }, { rootMargin: '0px 0px 120px 0px', threshold: 0 });
    document.documentElement.classList.add('mo');
  } else {
    document.documentElement.classList.remove('mo'); // home's index.html arrives with it
  }
  // Runs right after every draw, before the browser paints it (so nothing flashes in and then hides).
  const scan = () => {
    if (window.location.pathname !== navPath) { navPath = window.location.pathname; navStart = performance.now(); }
    document.documentElement.style.setProperty('--mo-t', `${Math.round(Math.min(sinceNav(), 20000))}ms`);
    askScroll();
    dotGrid();
    if (still) return;
    tag(app);
    firstPreScan = false;
  };
  firstPreScan = document.documentElement.classList.contains('pre');
  new MutationObserver(scan).observe(app, { childList: true, subtree: true });
  scan();
}
