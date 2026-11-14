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
- Canonical domain is centralized in `src/data/site-config.js` (`SITE_URL` / `SITE_HOST`) and `server/site.js` (`getSiteUrl(env)` / `getSiteHost(env)` reading optional `env.SITE_URL`, defaulting to `https://tamyiz.pages.dev`).
- `/admin` (`src/scripts/pages/admin-page.js`) is dynamically imported only when visiting `/admin` in `tamyiz-unified-app.js` and uses non-blocking toast notifications (`notify()`) and confirmation dialogs (`confirmAction()`).
- Server code: one Pages Function for all of `/api/*` (`functions/api/[[path]].js` → `server/router.js`). The Vite dev
  server runs the same router (`vite.config.js`), so local and live behave the same.

## E-books and /admin (24 Oct 2026)

- Every e-book is added on `/admin` (`src/scripts/pages/admin-page.js` + `src/styles/admin.css`, lazy-loaded via `admin.html` / `/admin`): title,
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
- Free Chapter 1 sample (`/api/sample`, `sample.js`): lead capture, an on-page reader, a welcome email, and a leads manager
  on /admin. Limit: 10 requests per IP per 15 min.
- Download recovery portal (`/api/recover-downloads`, `recovery.js`): a buyer enters their email to get links again
  (masked email shown). Limit: 8 per IP per 15 min.
- Reader reviews (`/api/reviews`, `reviews.js`): every new review is saved as `pending`; only reviews approved on
  /admin are shown (`store:reviews:approved`). `verifiedBuyer` is only a label, found by searching the latest 100 orders
  for the same email and book; anyone can still submit a review. The honesty rule below still applies: approve real
  reviews only. Book structured data (Google Book schema, with aggregate reviews) was added on 2 Nov in the SEO commit.
- Abandoned bag recovery (`/api/abandoned-cart`, `abandoned.js`): captures the email at checkout, a funnel view on
  /admin, and a 1-click restore of the bag. Limit: 20 per IP per 15 min.
- Security headers: `public/_headers` and `server/security-headers.js` set X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy and a Content-Security-Policy (`script-src 'self' https://checkout.razorpay.com`,
  without `'unsafe-inline'`). Dev dependencies were patched ("0 vulnerabilities"); re-run `npm audit` after any install.
- Rate limits use in-memory per-isolate `WeakMap` buckets (`checkRateLimit()` in `server/payments.js` and
  `securityBuckets` in `server/admin.js`, plus a global 180 req/min `/api/*` burst guard in `server/router.js`) and
  spend 0 KV writes, so floods cannot exhaust KV's 1,000-writes/day free-plan cap or break orders/uploads.
  (Zone-level Cloudflare WAF rate limiting requires moving to a custom domain zone rather than `tamyiz.pages.dev`.)

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

## Redesign 14 Nov 2026: "paper and hairlines" (approved by Sahil and pushed to `main` on 14 Nov 2026)

Look taken from a reference Sahil picked (Zajno's Zettafleet shot on Dribbble), redrawn for TAMYIZ: light paper
background, thin lines, square corners, small `[ BRACKETED ]` labels (`.tmz-label`), corner brackets round the key
words of a headline (`.tmz-mark`), frames with crosshair corners (`.tmz-frame`). Still Inter + Space Grotesk.
Colour (Sahil's call, 14 Nov 2026): black, white and ONE accent, highlighter yellow `--tmz-yellow` (#FFD60A). This
replaces "black and white only" above. Yellow is only a background or fill behind black (the highlighted headline
words, the one thing that matters in each drawing, button and icon hovers, the progress line, small squares, bold
footer links). Never yellow text on a light background (unreadable). The logo's red and the covers stay as they are. All of it is in the "REDESIGN 14 Nov 2026" block at the end of tamyiz-unified.css (new rules
go there; its phone rules are at the end of that block).

- Home, top to bottom: hero (meaning line, headline "Learn to tell ⌜the difference.⌟", lede + two buttons on the
  right, a line drawing of loose pages passing through a lens into one tidy stack, proof line) → "About us" panel
  with both founders (moved out of the hero; same portraits, quotes and links) → promise strip (now light) → latest
  e-books → "How we write" → "Read it anywhere" → closing line (wording depends on `anyAvailable()`) → footer with
  the wordmark very large. This replaces the 24 Oct hero layout above; the hero is still not tied to any product
  and still has no logo or book covers in it.
- `src/scripts/illustrations.js`: the line drawings, made in code (no image files). Original drawings; do not copy
  the reference's artwork.
- `src/scripts/motion.js` (started from `startApp()` in tamyiz-unified-app.js): scroll reveals, drawings that draw
  themselves, the dot grid behind the hero (reacts to the mouse), numbers that count up, book covers that lean
  toward the mouse, the yellow progress line at the top, and the pinned "How we write" section (on screens at least
  1024 x 640 it stays put and steps 01 → 03 as you scroll; otherwise three plain cards).
  Rules: it is decoration only (the page must work if it fails); nothing is hidden unless it has run (`html.mo`);
  "reduce motion" turns all of it off; animate only opacity, transform and line drawing; the app redraws pages
  with innerHTML, so `--mo-t` (time since the page was opened) keeps a redraw from replaying the arrival animation.
- Smoothness (measured 14 Nov 2026, home page, processor slowed 4x on a laptop size and 6x on a phone size): the
  first version ran at 27-29 frames a second while scrolling (the live site: 60). Three things caused it: a canvas
  that redrew every dot on every frame, SVG animations that looped forever, and the frosted (blurred) header now
  that it really sticks. Fixed: 60 frames a second while scrolling, 53-57 during the opening drawing. Rules that
  keep it there: NOTHING loops forever (animations run once, or only while the visitor scrolls or moves the mouse);
  no `backdrop-filter` and no `mask-image` over moving content; the header is solid paper, not glass (this replaces
  "frosted glass: the header only" above); the hero's dot grid is a still CSS background and the canvas only draws
  the few dots near the mouse while it moves. Re-measure with the same method before adding any new animation.
- Sticky header fix: `body` and `#app` had `overflow-x: hidden`, which silently stopped `position: sticky` (the
  header scrolled away). They are now `overflow-x: clip`. Do not put `overflow: hidden/auto` on an ancestor of the
  header or of `.tmz-steps-pin`.
- Checked 14 Nov 2026 (local): `npm test` 77 of 77 at the time (86 of 86 after the second pass below), `npm audit` 0, axe 0 violations on home, /editions, an e-book
  page, /atelier, /philosophy, a policy page, /checkout, /downloads, and /films (laptop and phone).
  Lighthouse mobile, local build, median of 5 runs: home performance 92 (the 24 Oct design scored 94 on the same
  machine), /editions 92, an e-book page 94; accessibility, best practices and SEO 100 on all three; CLS 0 to 0.06.
- Phones and touch screens get a lighter version on purpose: each drawing fades up as one piece (no line-by-line
  drawing), numbers do not count up, and nothing follows the finger. Line-by-line drawing is for screens 900px and
  wider with a mouse. Do not read `window.innerWidth`, `scrollHeight` or `getBoundingClientRect()` in code that runs
  on every redraw: it forces the whole page to be laid out early (this cost about 50 ms on a slow phone).

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
   Promo codes: coupons live dynamically in KV (`store:coupons`, managed on /admin). `VALID_COUPONS` in
   `server/payments.js` is empty (the old hard-coded `SAMPLE10` code was removed).
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

2 Nov 2026 to-dos (status):
- ~~Tighten the CSP (drop `'unsafe-inline'` for scripts)~~ (Done 14 Nov 2026: inline event handlers removed, `'unsafe-inline'` dropped from `script-src`).
- ~~Protect `/api/*` and `/api/admin/*` rate limits so abuse doesn't spend KV writes.~~ (Done 14 Nov 2026: all `/api/*`
  and `/api/admin/*` rate limiters moved to in-memory `checkRateLimit` / `securityBuckets` + global `/api/*` burst
  guard, spending `0` KV writes; optional custom-domain zone WAF rules remain for when a custom domain is added.)
- ~~Decide whether the hard-coded `SAMPLE10` stays~~ (Removed 14 Nov 2026: `VALID_COUPONS = {}`).
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
  "Admin Portal" link is kept in the footer and mobile menu (`1cb67a6`).
- Coupons: the bag checks codes with `GET /api/coupon?code=` (dynamic /admin coupons only). Flat coupons can have `minOrder`.
- Security headers for Functions responses are added in `server/security-headers.js` (Cloudflare does NOT apply
  `public/_headers` to Functions). Keep the CSP in both places in step.
- Emails that used to be "fire and forget" are now awaited (Cloudflare can cancel unawaited work).
- CSS: `--color-border` and `--font-head` are now defined (they were missing: invisible input borders, wrong heading font).
  Phones/touch: footer links 44px tall. axe: 0 violations on all pages again.
- Privacy policy rewritten to match what is really collected; Contact page names a Grievance Officer (Consumer Protection
  (E-Commerce) Rules 2020 / DPDP Act): currently Sahil Naseer, 48 h acknowledgement, 1 month resolution.

Fixed in `main` on 8 Nov 2026 (`npm test` 72 of 72, `npm audit` 0):
- `/api/webhook/razorpay`: always fetches the authoritative order from Razorpay (`GET /v1/orders/{order_id}`), ignores
  buyer-controlled `payment.notes`, verifies `payment.amount === order.amount`, and requires `RAZORPAY_WEBHOOK_SECRET`
  (no fallback to `RAZORPAY_KEY_SECRET`).
- `/api/verify-payment`: uses the buyer email and phone stored on the Razorpay order rather than trusting browser input;
  uses a deterministic order reference (`TMZ-${payment_id}`) so `verify-payment` and the webhook never generate two
  different order numbers.
- KV write resilience: rate-limit and download counter writes are wrapped in `try/catch` (with in-memory isolate fallback)
  so exhausting the daily 1,000 free KV writes never blocks checkout or paid PDF downloads; missing PDF files do not
  increment the download counter; `/api/coupon` is rate-limited.
- Order recovery scaling: orders are additionally indexed per customer (`buyer-orders:email:<email>`,
  `buyer-orders:phone:<digits>`) so buyers can always recover downloads even after `orders:index` rotates past 500 orders.
- `/admin` login protection: wrong passwords use zero KV writes (in-memory rate-limit bucket) and support stateless
  HMAC-signed 6-digit Email OTP 2FA via Brevo when `ADMIN_OTP_EMAIL` is set.

Hardened 14 Nov 2026:
- Removed hard-coded `SAMPLE10` promo code across server, emails, admin copy, and tests (only dynamic `/admin` coupons remain).
- Added Razorpay `refund.processed` webhook handling in `server/payments.js` (idempotent refund recording, download
  and recovery revocation on full refund, net revenue in `/api/admin/overview`, refund status badges on `/admin`).
- Removed all inline HTML `on*=` event handlers across `src/scripts/` via delegated listeners and dropped
  `'unsafe-inline'` from CSP `script-src` in `server/security-headers.js` and `public/_headers`.
- Added `<h2 class="sr-only">All films</h2>` to `.tmz-films-grid` on `/films`, removed unused `.tmz-footer-wordmark`
  CSS and legacy placeholder/copy leftovers.

Still open (optional future improvements when moving to a custom domain): own email domain (SPF/DKIM/DMARC),
and Cloudflare zone WAF rate-limiting rules for `/api/*` across isolates (in-isolate `/api/*` burst + endpoint
limiters are active with 0 KV writes).

## Audit and polish, second pass (14 Nov 2026, afternoon)

Security (tests in `tests/security.test.js`; `npm test` 91 of 91, `npm audit` 0):
- Admin 2FA could be bypassed by anyone who knew the password: the session cookie and the OTP challenge were both
  signed with the password itself, so the emailed code could be worked out offline (about 20 seconds) and a cookie
  could be forged without logging in. Both are now signed with a key derived from a server-only secret plus the
  password (`signingKey()` in `server/admin.js`). `ADMIN_SESSION_SECRET` is configured in Cloudflare Pages (`tamyiz`,
  production). Adding or changing it logs every admin out once. Never sign with the password alone again.
- Download links: `DOWNLOAD_SECRET` is configured in Cloudflare Pages (`tamyiz`, production); new links are signed with
  `DOWNLOAD_SECRET`, while links signed earlier with `RAZORPAY_KEY_SECRET` are still accepted (`downloadSecrets()` in
  `server/payments.js`), so existing buyer links keep working.
- CSP: `images.unsplash.com` removed (unused), `form-action 'self'` added (both places).
- /admin overview says "Latest 500 orders only" once `orders:index` is full (totals only cover those 500).
- Unused `@fontsource-variable/syne` dependency removed.
- Rate limits: all `/api/*` and `/api/admin/*` limiters (`api-burst`, `coupon-rate`, `sample-rate`, `recover-rate`,
  `recover-email`, `review-rate`, `abandoned-rate`, `order-rate`, `login`/`otp`) now run in-memory (`checkRateLimit` /
  `securityBuckets`) with 0 KV writes. KV backup snapshot saved locally in `.backups/tamyiz-kv-backup-2026-11-14.json`
  (plus `.backups/blobs/`, git-ignored; 15 JSON/text keys + 27 binary blobs). Still optional once a custom domain
  zone exists: cross-isolate Cloudflare WAF rate-limit rules and scheduled automated KV backups.

Design and motion (all in the "POLISH 14 Nov 2026 (second pass)" block at the end of tamyiz-unified.css):
- Book page: cover sits in a light 2:3 frame (no black bars), the E-BOOK tag is a yellow square tag top-left (it was
  clipped), `[ E-BOOKS ]` label, yellow "Instant download" tag, square card. Buy now = solid (main action),
  Add to bag = outline.
- 404, empty bag, receipt and policy pop-up use `.tmz-btn` (the old pill buttons `tamyiz-hero-btn-*` are no longer used).
- "About us" panel on home is two columns from 700 px (it used to stack and leave half the screen empty up to 1099 px).
- /downloads: square corners and a `[ LOST YOUR FILE? ]` label.
- Motion, all one-shot: the clicked cover glides to the book page (View Transitions, `navigateTo()`; plain swap where
  unsupported or with "reduce motion"); the bag count bumps when something is added; a drawing on 404 (`lostArt`)
  and after payment (`stepArt[2]`). Measured with the processor slowed 4x: 60 frames a second scrolling home and a
  book page.
