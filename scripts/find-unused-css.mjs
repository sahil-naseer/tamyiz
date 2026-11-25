// npm run css:unused          -> lists unused selectors (changes nothing)
// npm run css:unused -- write -> removes them (then build and compare every page before committing)
// Finds selectors in tamyiz-unified.css whose classes/ids never appear in any source file. Conservative:
// a class counts as used if it appears as a whole word anywhere, or starts with a prefix that the code builds
// dynamically (`foo-${x}` / 'foo-' + x).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CSS = path.join(ROOT, 'src/styles/tamyiz-unified.css');
const mode = process.argv[2] || 'report';

const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p);
  if (s.isDirectory()) { if (!['node_modules', 'dist', '.git', '.local-store', '_to_delete', '.claude', 'styles'].includes(f)) walk(p); }
  else if (/\.(js|mjs|html|json|md)$/.test(f) && !f.endsWith('.md')) files.push(p); } };
['src', 'functions', 'server', 'scripts', 'public'].forEach((d) => walk(path.join(ROOT, d)));
files.push(path.join(ROOT, 'index.html'), path.join(ROOT, 'admin.html'));
const corpus = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const words = new Set(corpus.match(/[A-Za-z_][\w-]*(?::[\w-]+)*/g));
// also whole tokens split only on characters a class name can't contain (keeps text-[11px], lg:w-1/2 ...)
for (const t of corpus.split(/[\s'"`<>={},;+]+/)) if (t) { words.add(t); words.add(t.replace(/[.)]+$/, '')); }
// dynamic prefixes: "abc-${", 'abc-' +, `abc-` +
const prefixes = new Set();
for (const m of corpus.matchAll(/([A-Za-z][\w-]*-)(?:\$\{|['"`]\s*\+)/g)) prefixes.add(m[1]);
const used = (name) => words.has(name) || [...prefixes].some((p) => name.startsWith(p));

const unesc = (s) => s.replace(/\\(.)/g, '$1');
function selectorDead(sel) {
  const s = sel.replace(/::?[\w-]+\((?:[^()]|\([^()]*\))*\)/g, (m) => (/^:(not|where|is|has)\(/.test(m) ? ' ' : m)); // ignore names inside :not()/:where()/:is()/:has()
  const classes = [...s.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => unesc(m[1]));
  const ids = [...s.matchAll(/#((?:\\.|[\w-])+)/g)].map((m) => unesc(m[1]));
  const missing = [...classes, ...ids].filter((n) => !used(n));
  return missing.length ? missing : null;
}

const src = fs.readFileSync(CSS, 'utf8');
const root = postcss.parse(src);
let removedSel = 0, removedRules = 0; const report = [];
root.walkRules((rule) => {
  if (rule.parent && rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
  const keep = [], drop = [];
  for (const sel of rule.selectors) { const dead = selectorDead(sel); (dead ? drop : keep).push(sel); if (dead) report.push(`${sel}   <- ${dead.join(', ')}`); }
  if (!drop.length) return;
  removedSel += drop.length;
  if (!keep.length) { rule.remove(); removedRules++; } else rule.selectors = keep;
});
// empty at-rules left behind
let changed = true;
while (changed) { changed = false; root.walkAtRules((a) => { if (/^(media|supports|layer|container)$/i.test(a.name) && a.nodes && a.nodes.length === 0) { a.remove(); changed = true; } }); }
// unused keyframes (not named in any animation in CSS or JS)
const cssNow = root.toString();
root.walkAtRules(/keyframes$/i, (a) => {
  const name = a.params.trim();
  const re = new RegExp(`(animation(-name)?\\s*:[^;]*\\b${name}\\b)`);
  if (!re.test(cssNow) && !new RegExp(`\\b${name}\\b`).test(corpus)) { report.push(`@keyframes ${name}`); a.remove(); }
});
console.log(`dead selectors: ${removedSel}, whole rules removed: ${removedRules}`);
if (mode !== 'write') console.log(report.join('\n'));
if (mode === 'write') fs.writeFileSync(CSS, root.toString());
console.log('lines before', src.split('\n').length, 'after', root.toString().split('\n').length);
