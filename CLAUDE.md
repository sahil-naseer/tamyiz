# TAMYIZ website

The online shop for TAMYIZ™ (co-founded by Sahil and Basit): PDF e-books that Sahil adds himself on /admin,
sold with Razorpay and delivered as private signed download links.

## Stack

- Vite single-page app (plain JavaScript, no framework). `npm run dev` for local work. (three.js and the grain-sparks script were removed 24 Oct 2026: unused.)
- Hosting (moved from Vercel 23 Oct 2026): Cloudflare Pages, free plan (Vercel's free plan forbids business sites).
  Build `npm run build` (= `vite build` + `scripts/build-pages.js`), output `dist`. Production branch: `main`
  (Settings → Build → Branch control); pushes to any other branch only make Preview builds.
- Pages: `scripts/build-pages.js` writes one HTML file per fixed page (`editions.html`, `legal/<slug>.html` ...) with
  that page's title, description and share picture from `src/data/seo.js`, plus `404.html` (the `<!-- seo -->` markers
  stay in). Cloudflare answers unknown addresses with a real 404. A NEW fixed route in `parseRoute()`
  (tamyiz-unified-app.js) must also be added to `allPages()` in seo.js, or it 404s when opened directly.
- E-book pages `/edition/<slug>` and `/sitemap.xml` are made live by Pages Functions (`functions/edition/[slug].js`,
  `functions/sitemap.xml.js`) from the catalogue, so each e-book's cover is its share preview. Default share picture: `public/og/tamyiz.jpg`.
- Server code: one Pages Function for all of `/api/*` (`functions/api/[[path]].js` → `server/router.js`). The Vite dev
  server runs the same router (`vite.config.js`), so local and live behave the same.

## E-books and /admin (24 Oct 2026)

- The 8 template products are gone. Every e-book is added on `/admin` (`admin.html`, `src/admin/admin.js`): title,
  one-line summary, price, pages, description, chapters, cover (shrunk to 1200 px in the browser), PDF (max 25 MB).
- Small covers: /admin also makes a 720 px `thumb:<id>` (served at `/api/cover/<id>?s=sm`); cards and the bag use
  `product.thumb` (falls back to the full cover). Opening /admin backfills thumbs for books that lack one.
- Storage: Cloudflare KV, binding `TAMYIZ_STORE` (free; 1 GB, 25 MiB per value, 1,000 writes/day). Keys: `products`
  (JSON list), `cover:<id>`, `file:<id>`. See `server/catalog.js`. Locally: `.local-store/` (`server/dev-kv.js`).
- Status per e-book: `draft` (admin only) · `soon` (shop, "Pre-order on WhatsApp") · `on-sale` (buyable; needs the PDF).
  The payment server sells only `on-sale` books (409 otherwise), so the page can't be tampered into selling others.
- The shop loads `/api/products` before drawing (preloaded in index.html); `src/data/products.js` is filled in place.
  Text from /admin is HTML-escaped by the server (`publicProduct`) because the shop draws with innerHTML; seo.js and the
  WhatsApp pre-order message unescape it. The admin page itself only uses textContent.
- Admin login: Cloudflare secret `TAMYIZ_ADMIN_PASSWORD` (or `ADMIN_PASSWORD`; 12+ chars) → signed cookie (HttpOnly, Secure, SameSite=Strict,
  Path=/api/admin, 12 h). 10 wrong passwords per IP → 15 min lock. Changes also need header `X-Tamyiz-Admin: 1`.
- Downloads: after a verified payment, `/api/download/<id>?p=<payment>&e=<expiry>&s=<HMAC>` (1 year), signed with
  `DOWNLOAD_SECRET` or `RAZORPAY_KEY_SECRET`. The PDF is never at a public address. A paid order is delivered even if
  the book is switched off later; deleting a book breaks its links (admin warns).
- Settings (Cloudflare: project → Settings → Variables and secrets; locally `.dev.vars` for wrangler or `.env` for Vite,
  both git-ignored): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (secret), `BREVO_API_KEY` (secret, receipt emails; used first),
  `RAZORPAY_WEBHOOK_SECRET` (secret, verifies Razorpay's webhook), `CF_API_TOKEN` / `CF_ACCOUNT_ID` / `CF_SITE_TAG` (visitor stats), `RESEND_API_KEY` (secret, alternative receipts, needs own domain), `RECEIPT_FROM` (optional sender; default tamyiz.co@gmail.com, must be verified in Brevo), `DOWNLOAD_SECRET` (optional), `TAMYIZ_SANDBOX` (never in production).
- Deploys stop silently if Cloudflare loses access to this repo (yellow "disconnected" banner in the Pages project).
  Fix: GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure → Repository access must list
  BOTH tamyiz and eternal-polyclinic → Save. (Happened 23 Oct 2026.)
- Visitor stats (25 Oct 2026): Cloudflare Web Analytics is on (Pages project → Metrics → Web Analytics; cookieless, counts
  only, no personal data). The privacy policy (/legal/privacy, section 03) says so; keep it in step if analytics changes.
  /admin shows a Visitors card (visits, page views, per day, sources, pages, countries, devices; Today/7/30 days) from
  `GET /api/admin/stats` (`server/stats.js`, admin login required), which asks Cloudflare's GraphQL API using the secret
  `CF_API_TOKEN` (Account Analytics: Read only). Account id and site tag are in stats.js (identifiers, not secrets).
- Tests: `npm test` (node test runner, `tests/`: payments, downloads, admin). Run before every push. `npm run cf:dev` runs the built site on
  Cloudflare's runtime locally (wrangler, with a local KV store; set ADMIN_PASSWORD/TAMYIZ_SANDBOX in .dev.vars).

## Added on 2 Nov 2026 (read from the code and git history)

About ten commits landed on 2 Nov. Everything below is in `server/` (routes in `server/router.js`) unless noted.

- Orders and webhook: orders are saved (`orders:index`, `order:<id>`); Razorpay webhook at `/api/webhook/razorpay`
  (also `/api/razorpay-webhook`, signature checked with `RAZORPAY_WEBHOOK_SECRET`); a payment already fulfilled is not
  fulfilled twice (idempotency); order creation is rate-limited.
- Downloads: each paid link allows `MAX_DOWNLOADS` = 10 downloads, then asks the buyer to message on WhatsApp with
  the payment ID. Digital books are limited to one copy per order.
- Admin: one unified dashboard on /admin (orders, analytics, coupons, gift orders, announcement banner, leads,
  reviews, abandoned bags). Logging out revokes the session on the server, not just in the browser.
- Coupons, gifts and banner: dynamic coupons (`store:coupons`), gift orders, link re-send, and a site announcement
  banner (`store:announcement`, public `GET /api/announcement`).
- Free Chapter 1 sample (`/api/sample`, `sample.js`): lead capture, an on-page reader, a welcome email sequence that
  includes the SAMPLE10 gift, and a leads manager on /admin. Limit: 10 requests per IP per 15 min.
- Download recovery portal (`/api/recover-downloads`, `recovery.js`): a buyer enters their email to get links again
  (masked email shown). Limit: 8 per IP per 15 min.
- Reader reviews (`/api/reviews`, `reviews.js`): every new review is saved as `pending`; only reviews approved on
  /admin are shown (`store:reviews:approved`). `verifiedBuyer` is only a label, found by searching the latest 100 orders
  for the same email and book; anyone can still submit a review. The honesty rule below still applies: approve real
  reviews only. Book structured data (Google Book schema, with aggregate reviews) was added on 2 Nov in the SEO commit.
- Abandoned bag recovery (`/api/abandoned-cart`, `abandoned.js`): captures the email at checkout, a funnel view on
  /admin, and a 1-click restore of the bag. Limit: 20 per IP per 15 min.
- Security headers: `public/_headers` sets X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and a
  Content-Security-Policy. The CSP still allows `'unsafe-inline'` scripts (needed by the current page); tightening it
  is a known to-do. Dev dependencies were patched ("0 vulnerabilities" per commit 972b8d9); re-run `npm audit` after any install.
- Rate limits are counters stored in KV. KV's free plan allows only 1,000 writes per day (see Storage), and each
  counted request is a write, so a flood of requests could use up the day's writes and break orders and uploads.
  Prefer Cloudflare's own rate limiting rules in front of /api for anything public.

## Selling

Coming soon = "COMING SOON" badge, "Pre-order on WhatsApp" button (product filled in), no Buy Now, no Bag/Checkout
in the header unless some book is on sale, product schema PreOrder. To sell a book: upload its PDF on /admin and set
"On sale". Payments also need Razorpay keys in Cloudflare.
Delivery: the download shows on screen (main delivery) AND a receipt email with the same links is sent via Brevo
(working since 25 Oct 2026: first real test receipt landed in Gmail Inbox). Lost files are re-sent by hand on WhatsApp.
The after-payment screen claims the email only when Brevo accepted it (`receiptEmailed`).

## Razorpay activation (started 24 Oct 2026)

Status 24 Oct 2026: account activated (KYC complete); website https://tamyiz.pages.dev/ approved. Test purchase passed
(test card → "Payment received" → PDF downloaded). LIVE keys now in Cloudflare (`RAZORPAY_KEY_ID` Text,
`RAZORPAY_KEY_SECRET` Secret, Production): an "On sale" book takes real money. Razorpay customer support details:
tamyiz.co@gmail.com, +91 95417 22379, contact link /legal/contact.
Test mode tips: the UPI tab only shows a QR (real apps can't pay it); use test card 5104 0600 0000 0008, any CVV/future
expiry, OTP of 4+ digits. Payment method is chosen in Razorpay's window; checkout has no method picker of its own.
If test keys are ever put back, an on-sale book can be "bought" with Razorpay's public test card: keep books
"Coming soon" during any test-key period.

Razorpay checks the site for these pages; give them these addresses:
About `/atelier` · Contact `/legal/contact` · Pricing `/editions` · Terms `/legal/terms` · Privacy `/legal/privacy` ·
Refunds `/legal/license` (titled "Refund, Cancellation & License Policy") · Shipping `/legal/delivery-protocol`
(titled "Shipping & Delivery Policy"; Razorpay asks for a shipping policy even for digital goods). Keep them live and named like this.
Razorpay also asks for a sample invoice: a sample receipt PDF can be made from `server/payments.js`'s receipt layout.
The contact form has no mail server: it opens WhatsApp with the message filled in. Never fake a "message received".

## Honesty rules (decided by Sahil and Basit, 24 Oct 2026)

- No struck-through "was" prices, "SAVE x%", "BESTSELLER", star ratings or review counts until they are real.
  Reviews now exist: only approve real ones from real readers, never write or buy any. Automatic bundle discounts must
  be shown as what they are (a discount for buying 2+ books), never as a fake "was" price.
- It is a "Receipt", never a "Tax invoice" (that needs GST registration).
- Nothing is sent on WhatsApp automatically; never claim it. Page counts stay "planned" until the book exists.
- Sopore/Kashmir only in legal contact details and receipts, not in brand copy (TAMYIZ is a global brand).

## Design (redesign 24 Oct 2026, approved by Sahil)

- Black and white. The only colour is the logo's red grain (and book covers further down the page). The old red accent
  variables (`--color-red`, `--color-red-ink`...) now map to black/white in the "REDESIGN 24 Oct 2026" block at the end
  of tamyiz-unified.css; new rules go in that block. Success states (paid, toast) keep their green.
- Logo: `public/assets/brand/tamyiz-dome-sm.webp` (Sahil's red emblem, cropped so the dome is centred, 240 px, 8 KB) +
  `tamyiz-wordmark.svg`, in the header on every page (phones: icon-only menu/bag so it fits).
- Home hero (24 Oct 2026, approved): headline "Learn to tell the difference." (what *Tamyiz* means), the existing
  lede, two buttons, and a proof line counted from the catalogue (`heroProof()`: e-book count, total pages only when
  every book has a page count). Right side: an "About us" card with both founders. It is deliberately NOT tied to
  any product, so it stays right whatever TAMYIZ sells next. Portraits: `founders/<name>-portrait.webp`, cropped so
  both faces are the same size with the eyes on the same line (42% down, 4:5, greyscale); redo both together if a
  photo changes. No logo or book covers in the hero (Sahil's calls).
- About page `/atelier` (24 Oct 2026): plain words ("About us", why we started, what the name means, founders, contact).
  No "atelier/architects/studio/concierge/editions/protocol" wording anywhere visible; the old studio photo is gone
  (it wasn't theirs). Nav: Home · E-books · How we write · About us (→ /atelier) · Read anywhere. Footer: Pages · Shop ·
  Help and policies. The home page's old "Who makes TAMYIZ" section was removed (the hero card covers it).
  Keep URLs and the legal page titles as they are (Razorpay has them on file).
- Headings are sentence case everywhere; page banners are light like the About intro (CSS "Calm type everywhere" block).
- Frosted glass (`.tmz-glass`): the header only for now.
- Hidden menu/bag drawers are `visibility: hidden` with no shadow until opened (their shadows used to leak onto the page edges).

- Start-up: index.html holds a placeholder (logo + loading bar) so slow connections never see a white page; the app
  replaces it once /api/products answers. If that fails, home and /editions say "Couldn't load the e-books" with a
  Try again button (`loadState.failed`, `retryProducts()`), never "first e-books on the way".
- Browser storage can be blocked: every localStorage call must be in try/catch (a throw once stopped checkout).
- Fonts: Inter + Space Grotesk only (Syne dropped; the footer wordmark is the SVG).
- Smoothness (24 Oct 2026): no backdrop-filter on full-screen overlays (menu, bag, pop-ups) or on cards: it made
  phones stutter (100 ms frames). Only the header keeps a glass blur (lighter on touch screens). Never use
  `transition: all`; list the properties (opacity, transform, colours...).

## Phone layout and shared content (24 Oct 2026)

- Phones (<640px): one spacing scale in the "PHONES (up to 639px)" blocks at the end of tamyiz-unified.css: sections
  40px top/bottom, promise strip 2x2, product cards = cover left + details right + buttons below (the cover badge is
  hidden there; `.tamyiz-card-status` shows "Coming soon" instead). Add phone rules there, not scattered.
- Covers are portrait 2:3 everywhere (cards, product page, bag thumbnail). From 640px up, cards show the cover as a book on a
  fixed-height light panel (250–330px) so a whole card fits on one screen; don't go back to full-width covers (~800px tall). The product page reserves the cover's space
  (no layout shift: keep CLS < 0.1).
- "How we write" and "Read it anywhere" live once in `src/scripts/pages/sections.js` (home + /philosophy). FAQ in
  `src/data/content.js`. Everything describes PDF e-books only: no Notion/Figma/EPUB, no "lifetime updates", nothing
  "sent on WhatsApp".

## Quality baseline (24 Oct 2026, local build, rechecked after the phone pass)

axe: 0 violations on every page incl. /admin, phone and desktop. Lighthouse mobile: performance 91–99, accessibility 100,
SEO 100, best practices 100. Touch screens get 44px tap areas (`@media (pointer: coarse)` block at the end of
tamyiz-unified.css). Don't ship below this.

## Payment rules (security; do not loosen)

1. The server decides the payment mode. Never trust a `mode`, price or item list sent by the browser.
2. With Razorpay keys set: unlock only after the HMAC signature matches (Web Crypto, constant-time compare) AND
   Razorpay's API confirms the payment belongs to that order, is authorized/captured, and covers the order amount.
3. What gets unlocked is read back from the Razorpay order notes written at creation (`itemsToNotes`/`notesToItems`).
4. Prices come from the catalogue in KV (set on /admin), read by the server at order time. The bag refreshes every
   item's price from the catalogue on load (`store.pruneUnavailable`), so it always shows what will be charged.
   Promo codes (changed 2 Nov 2026): the 24 Oct note "none" is out of date. Coupons now live in KV (`store:coupons`,
   managed on /admin) plus one hard-coded code, `SAMPLE10` (10%, in `VALID_COUPONS`, server/payments.js). The repo is
   PUBLIC, so anything hard-coded there is public: use /admin coupons for real promotions, and treat SAMPLE10 as known to everyone.
   Automatic volume discount: 2 books = 20% off, 3+ books = 25% off (`calculateOrderTotal`), applied before any coupon.
5. The sandbox simulator (free unlock, for testing) runs only when `TAMYIZ_SANDBOX=true`. Never set it in production.
   Without keys and without sandbox, checkout returns a polite 503 pointing buyers to WhatsApp.
6. Never commit keys. The repo is public.

## Open issues (24 Oct 2026 notes, plus 2 Nov 2026 to-dos)

- Cloudflare setup 24 Oct 2026: KV namespace `tamyiz-store` bound as `TAMYIZ_STORE` (Production). The first names were
  saved with a trailing dot ("TAMYIZ_STORE.") and didn't work; names must match exactly. The dashboard then refused
  "ADMIN_PASSWORD" as already existing while not listing it, so the password secret is `TAMYIZ_ADMIN_PASSWORD`.
  Bindings and secrets only apply after a new deployment.
- Receipt emails: WORKING since 25 Oct 2026 (Brevo, sender tamyiz.co@gmail.com, key `BREVO_API_KEY`). Test purchase
  25 Oct: receipt arrived in Inbox (Gmail shows the sender as tamyiz.co@…brevosend.com, normal for a Gmail sender).
  FAQ, delivery policy, checkout and legal contact block now mention the email receipt. Better later: own domain
  (Brevo or Resend) so the sender looks clean and spam risk drops. Buyers before 25 Oct 22:45 IST got no email.

2 Nov 2026 to-dos (found while updating this file):
- Tighten the CSP (drop `'unsafe-inline'` for scripts) when the page's inline scripts are moved out.
- Add Cloudflare rate limiting rules for `/api/*` and `/api/admin/*` so abuse doesn't spend KV writes.
- Decide whether the hard-coded `SAMPLE10` stays; it is visible to anyone reading the public repo.
- Checked 2 Nov 2026 on commit a9939a8: `npm test` 52 of 52 pass, `npm audit` 0 vulnerabilities. Re-run both after every change.

## Security and compliance audit (7 Nov 2026)

Fixed in branch `fix/pre-launch-audit` (tests: `tests/security.test.js`; `npm test` 66 of 66, `npm audit` 0):
- `/api/recover-downloads` never shows links on screen and answers the same whether or not a purchase exists; links go
  only to the email saved on the order. Phone lookups need the full 10 digits. No email provider = honest 503.
- `/api/verify-payment`: the "already fulfilled" shortcut runs only AFTER the Razorpay signature check (payment IDs are
  visible in download links, so they must never unlock buyer details or links on their own).
- `/api/reviews` (public) never returns reviewer emails; `averageRating` is null with no reviews. Reviews only for books
  in the shop. Book structured data has NO aggregateRating unless real review numbers are passed (never a made-up count).
  The product page shows stars only when approved reviews exist.
- `/api/sample` refuses drafts; leads no longer store IP address or device; one welcome email per address.
- Abandoned bags: id = hash of the whole email; item names/prices come from the catalogue; "emailed" only if Brevo accepted.
- Admin: logout needs a valid session; banner links must be http(s) or /path; CSV exports are formula-safe; the
  "Admin Portal" link was removed from the footer and menu (open /admin directly).
- Coupons: the bag checks codes with `GET /api/coupon?code=` (SAMPLE10 + /admin coupons). Flat coupons can have `minOrder`.
- Security headers for Functions responses are added in `server/security-headers.js` (Cloudflare does NOT apply
  `public/_headers` to Functions). Keep the CSP in both places in step.
- Emails that used to be "fire and forget" are now awaited (Cloudflare can cancel unawaited work).
- CSS: `--color-border` and `--font-head` are now defined (they were missing: invisible input borders, wrong heading font).
  Phones/touch: footer links 44px tall. axe: 0 violations on all pages again.
- Privacy policy rewritten to match what is really collected; Contact page names a Grievance Officer (Consumer Protection
  (E-Commerce) Rules 2020 / DPDP Act): currently Sahil Naseer, 48 h acknowledgement, 1 month resolution.

Still open (needs the owners): Cloudflare rate-limit rule for /api/*, a backup/export of orders, own email domain
(SPF/DKIM/DMARC), refund webhook (refunded payments keep their links), CSP 'unsafe-inline' (inline onclick handlers
everywhere), "verifiedBuyer" label can be claimed by typing a buyer's email (approve reviews with care).
