// npm run css:overridden          -> counts declarations that a later rule always overrides (changes nothing)
// npm run css:overridden -- write -> removes them (then build and compare every page before committing)
//
// The stylesheet grew in layers (24 Oct, 14 Nov, 25 Nov...): later blocks restate the same selectors. A declaration
// is removed only when it can never win: a LATER rule with the IDENTICAL selector sets the IDENTICAL property, in the
// same @media/@supports context or with no condition at all, and is not weaker (!important). Same selector means same
// specificity, so the later one always wins. Kept on purpose: fallbacks (a property set twice in one rule, newer units
// like dvh, vendor prefixes), shorthand vs longhand pairs, and anything inside @keyframes / @font-face.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CSS = path.join(ROOT, 'src/styles/tamyiz-unified.css');
const mode = process.argv[2] || 'report';

const src = fs.readFileSync(CSS, 'utf8');
const root = postcss.parse(src);
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();
const ctxOf = (node) => { const parts = []; let p = node.parent; while (p && p.type !== 'root') { if (p.type === 'atrule') parts.unshift(`@${p.name} ${norm(p.params)}`); p = p.parent; } return parts.join(' | '); };
const risky = (v) => /\b\d*\.?\d+(dvh|svh|lvh|dvw|svw|lvw|cqw|cqh)\b|color-mix|oklch|oklab|lab\(|lch\(|-webkit-|-moz-|anchor\(/i.test(v);

const rules = [];
root.walkRules((rule) => {
  let p = rule.parent; while (p && p.type !== 'root') { if (p.type === 'atrule' && /keyframes|font-face|page/i.test(p.name)) return; p = p.parent; }
  rules.push({ rule, ctx: ctxOf(rule), sels: rule.selectors.map(norm) });
});

// For each (selector, prop): the strongest later setter, walking from the end.
// later[ctx][sel][prop] = { important } meaning "some later rule in ctx sets it"
const later = new Map();
const get = (ctx, sel) => { if (!later.has(ctx)) later.set(ctx, new Map()); const m = later.get(ctx); if (!m.has(sel)) m.set(sel, new Map()); return m.get(sel); };
let removed = 0;
for (let i = rules.length - 1; i >= 0; i -= 1) {
  const { rule, ctx, sels } = rules[i];
  const decls = rule.nodes.filter((n) => n.type === 'decl');
  const count = {}; decls.forEach((d) => { const k = d.prop.toLowerCase(); count[k] = (count[k] || 0) + 1; });
  // 1) prune this rule's declarations that a later rule always beats (for EVERY selector in the list)
  for (const d of decls) {
    const prop = d.prop.toLowerCase();
    if (count[prop] > 1 || prop.startsWith('-webkit-') || prop.startsWith('-moz-')) continue;
    const beaten = sels.every((sel) => {
      for (const c of new Set([ctx, ''])) {
        const hit = later.get(c)?.get(sel)?.get(prop);
        if (hit && (hit.important || !d.important) && !hit.risky) return true;
      }
      return false;
    });
    if (beaten) { if (mode === 'write') d.remove(); else if (process.env.SHOW) console.log(sels.join(", "), "|", d.prop, "| line", d.source.start.line); removed += 1; }
  }
  // 2) record what this rule sets, for the rules before it
  for (const d of decls) {
    const prop = d.prop.toLowerCase();
    const info = { important: !!d.important, risky: count[prop] > 1 || risky(d.value) };
    for (const sel of sels) {
      const m = get(ctx, sel); const prev = m.get(prop);
      // keep the strongest/safest claim: an !important later setter beats everything before it
      if (!prev || (info.important && !prev.important) || (prev.risky && !info.risky && info.important === prev.important)) m.set(prop, info);
    }
  }
}
if (mode === 'write') {
  root.walkRules((r) => { if (!r.nodes.some((n) => n.type === 'decl' || n.type === 'rule' || n.type === 'atrule')) r.remove(); });
  let changed = true;
  while (changed) { changed = false; root.walkAtRules((a) => { if (/^(media|supports)$/i.test(a.name) && a.nodes && !a.nodes.some((n) => n.type !== 'comment')) { a.remove(); changed = true; } }); }
  fs.writeFileSync(CSS, root.toString());
}
console.log(`declarations always overridden by a later rule: ${removed}`);
console.log('lines', src.split('\n').length, '->', (mode === 'write' ? root.toString() : src).split('\n').length);
