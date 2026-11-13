/**
 * TAMYIZ line illustrations (14 Nov 2026). Drawn here in code, so there are no image files to load and
 * they stay sharp at any size. Black hairlines on paper, isometric (the same angle everywhere); the one
 * thing that matters in each drawing is filled with the yellow accent (class "hot").
 *
 * Every line has pathLength="1" and the class "ln": the motion layer draws them in with a dash offset
 * (see "Illustrations" in tamyiz-unified.css). Without motion they are simply visible.
 * All of them are decoration (aria-hidden): the words next to them say the same thing.
 */

const K = Math.sqrt(3) / 2;

/** One drawing: collects its lines and works out its own viewBox. */
function sheet() {
  const out = [];
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let order = 0;

  /** World point (x right-down, y left-down, z up) to a screen point. */
  const p = (x, y, z = 0) => {
    const sx = (x - y) * K;
    const sy = (x + y) / 2 - z;
    box.x0 = Math.min(box.x0, sx); box.x1 = Math.max(box.x1, sx);
    box.y0 = Math.min(box.y0, sy); box.y1 = Math.max(box.y1, sy);
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  };
  const path = (d, cls = '') => { out.push(`<path class="ln ${cls}" style="--d:${order++}" pathLength="1" d="${d}"/>`); };
  const shape = (pts, cls) => path(`M${pts.join('L')}Z`, cls);
  const line = (pts, cls = '') => path(`M${pts.join('L')}`, `open ${cls}`);

  /** A block: its top and the two sides you can see. */
  /** `topCls` styles only the top face (e.g. 'hot' = the yellow accent). */
  const slab = (x, y, z, w, d, h, cls = '', topCls = cls) => {
    shape([p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)], cls);
    shape([p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)], cls);
    shape([p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)], topCls);
  };
  /** Lines of "text" on top of a block (they run along its width). */
  const textLines = (x, y, zt, w, d, rows, cls = 'thin') => {
    rows.forEach(([at, from, to]) => line([p(x + w * from, y + d * at, zt), p(x + w * to, y + d * at, zt)], cls));
  };
  /** A tick that reads as a tick on screen: a short stroke down-right, then a long one up-right. (x, y) is its start. */
  const tick = (x, y, zt, s, cls = '') => line([p(x, y, zt), p(x + s * 0.45, y, zt), p(x + s * 0.45, y - s, zt)], cls);
  const group = (cls, style, fn) => { out.push(`<g class="${cls}" style="${style}">`); fn(); out.push('</g>'); };
  const raw = (s) => out.push(s);

  const svg = (cls, pad = 6) => {
    const w = box.x1 - box.x0 + pad * 2;
    const h = box.y1 - box.y0 + pad * 2;
    return `<svg class="tmz-il ${cls}" viewBox="${(box.x0 - pad).toFixed(1)} ${(box.y0 - pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${Math.round(w)}" height="${Math.round(h)}" fill="none" aria-hidden="true" focusable="false">${out.join('')}</svg>`;
  };
  return { p, path, shape, line, slab, textLines, tick, group, raw, svg };
}

/** Screen-friendly placement: `a` moves right, `b` moves toward the viewer. */
const at = (a, b) => [a + b, -a + b];

/**
 * Hero: loose pages on the left pass through a lens and come out as one tidy stack.
 * (What "tamyiz" means: telling things apart, the useful from the noise.)
 */
/** The pages are drawn again whenever the app redraws, so each drawing is built once and kept. */
const once = (fn) => { let out = null; return () => (out === null ? (out = fn()) : out); };

export const heroArt = once(() => {
  const s = sheet();

  // The floor under the finished stack (a faint grid).
  const [gx, gy] = at(232, 56);
  for (let i = 0; i <= 5; i += 1) {
    s.line([s.p(gx - 130 + i * 52, gy - 130, 0), s.p(gx - 130 + i * 52, gy + 130, 0)], 'faint');
    s.line([s.p(gx - 130, gy - 130 + i * 52, 0), s.p(gx + 130, gy - 130 + i * 52, 0)], 'faint');
  }

  // Loose pages, different sizes and heights, drifting.
  const loose = [
    [-286, -30, 70, 40, 52], [-250, 36, 20, 30, 40], [-228, -66, 116, 28, 36], [-204, 6, 58, 46, 60],
    [-180, 60, 6, 32, 42], [-164, -44, 30, 24, 32], [-144, -2, 104, 36, 46], [-124, 46, 46, 28, 36],
    [-110, -30, 68, 22, 28], [-92, 16, 22, 30, 40], [-80, -58, 8, 20, 26],
  ];
  loose.forEach(([a, b, z, w, d], i) => {
    const [x, y] = at(a, b);
    s.group('il-float', `--f:${i}`, () => {
      s.slab(x, y, z, w, d, 3);
      if (w > 26) s.textLines(x, y, z + 3, w, d, [[0.3, 0.2, 0.8], [0.5, 0.2, 0.62]]);
    });
  });

  // Paths from the loose pages, through the lens, to the stack.
  [[-56, -24, 70], [-56, 6, 52], [-56, 36, 34]].forEach(([a, b, z]) => {
    const [x0, y0] = at(a, b);
    const [x1, y1] = at(-4, 6);
    s.line([s.p(x0, y0, z), s.p(x1, y1, 68)], 'flow');
  });

  // The lens: an upright frame with two rings.
  const [lx, ly] = at(30, 8);
  s.slab(lx - 60, ly, 0, 120, 6, 150);
  const ring = (r, cls) => {
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const t = (i / 48) * Math.PI * 2;
      pts.push(s.p(lx + Math.cos(t) * r, ly + 6, 75 + Math.sin(t) * r));
    }
    s.line(pts, cls);
  };
  ring(44, '');
  ring(26, 'thin');
  [[-52, 10], [52, 10], [-52, 140], [52, 140]].forEach(([dx, z]) => s.line([s.p(lx + dx - 5, ly + 6, z), s.p(lx + dx + 5, ly + 6, z)], 'thin'));

  const [ox, oy] = at(72, 10);
  const [sx0, sy0] = at(158, 44);
  s.line([s.p(ox, oy, 75), s.p(sx0, sy0, 62)], 'flow');

  // The tidy stack.
  const [bx, by] = at(232, 56);
  for (let i = 0; i < 4; i += 1) s.slab(bx - 55 - (i % 2) * 4, by - 72 + (i % 2) * 4, i * 14, 110, 144, 12, '', i === 3 ? 'hot' : '');
  const zt = 3 * 14 + 12;
  const tx = bx - 55 - 4;
  const ty = by - 72 + 4;
  s.textLines(tx, ty, zt, 110, 144, [[0.2, 0.14, 0.7], [0.33, 0.14, 0.86], [0.45, 0.14, 0.86], [0.57, 0.14, 0.52]]);
  s.tick(tx + 62, ty + 122, zt, 24);

  return s.svg('tmz-il-hero', 10);
});

/** "Practical, not padded": the padding (ghosted) next to the slim book that is left. */
function artPractical() {
  const s = sheet();
  const [gx, gy] = at(-40, -14);
  for (let i = 0; i < 7; i += 1) s.slab(gx - 36, gy - 48, i * 11, 72, 96, 9, 'ghost');
  const [bx, by] = at(34, 30);
  for (let i = 0; i < 2; i += 1) s.slab(bx - 40, by - 54, i * 13, 80, 108, 11, '', i === 1 ? 'hot' : '');
  s.textLines(bx - 40, by - 54, 24, 80, 108, [[0.2, 0.16, 0.74], [0.34, 0.16, 0.84], [0.48, 0.16, 0.6]]);
  s.tick(bx + 2, by + 40, 24, 20);
  return s.svg('tmz-il-step');
}

/** "Plain English": one clear page, with a small note lifting off it. */
function artPlain() {
  const s = sheet();
  const [x, y] = at(0, 6);
  s.slab(x - 46, y - 60, 0, 92, 120, 7);
  s.line([s.p(x - 32, y - 40, 7), s.p(x + 8, y - 40, 7)], 'bold');
  s.textLines(x - 46, y - 60, 7, 92, 120, [[0.32, 0.15, 0.85], [0.44, 0.15, 0.85], [0.56, 0.15, 0.7], [0.72, 0.15, 0.85], [0.84, 0.15, 0.5]]);
  const [nx, ny] = at(34, -34);
  s.group('il-float', '--f:2', () => {
    s.slab(nx - 22, ny - 16, 62, 44, 32, 3, '', 'hot');
    s.textLines(nx - 22, ny - 16, 65, 44, 32, [[0.36, 0.18, 0.82], [0.64, 0.18, 0.6]], '');
  });
  s.line([s.p(nx, ny + 16, 62), s.p(nx, ny + 16, 12)], 'flow');
  return s.svg('tmz-il-step');
}

/** "Yours instantly": a page dropping straight onto your own device. */
function artInstant() {
  const s = sheet();
  const [x, y] = at(0, 8);
  s.slab(x - 36, y - 62, 0, 72, 124, 6);
  s.shape([s.p(x - 30, y - 54, 6), s.p(x + 30, y - 54, 6), s.p(x + 30, y + 54, 6), s.p(x - 30, y + 54, 6)], 'thin');
  [[-22, -42], [22, -42], [22, 42], [-22, 42]].forEach(([dx, dy]) => s.line([s.p(x + dx, y + dy, 84), s.p(x + dx, y + dy, 8)], 'flow'));
  s.group('il-float', '--f:1', () => {
    s.slab(x - 22, y - 42, 84, 44, 84, 2.5, '', 'hot');
    s.textLines(x - 22, y - 42, 86.5, 44, 84, [[0.22, 0.18, 0.7], [0.38, 0.18, 0.82], [0.54, 0.18, 0.82], [0.7, 0.18, 0.5]]);
  });
  // The arrow between the two, pointing down.
  s.line([s.p(x + 34, y, 66), s.p(x + 34, y, 26)], '');
  s.line([s.p(x + 27, y, 36), s.p(x + 34, y, 26), s.p(x + 41, y, 36)], '');
  return s.svg('tmz-il-step');
}

export const stepArt = [artPractical, artPlain, artInstant].map(once);
