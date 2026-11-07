// Title, description, address and share picture for every page.
// Used twice: by scripts/build-pages.js (writes one HTML file per page, so search engines and WhatsApp/Instagram
// link previews see the right title and picture), and by the app (updates the tab title when you move between pages).
import { products } from './products.js';
import { legalDocs } from '../scripts/pages/legal-page.js';

export const SITE_URL = 'https://tamyiz.pages.dev';
const BRAND = 'TAMYIZ™';
const DEFAULT_IMAGE = '/og/tamyiz.jpg';
const DEFAULT_DESCRIPTION =
  'Practical e-books by TAMYIZ™, delivered as instant PDF downloads.';

const STATIC_PAGES = {
  home: {
    path: '/',
    title: `${BRAND} | Practical e-books, instant download`,
    description: DEFAULT_DESCRIPTION,
  },
  editions: {
    path: '/editions',
    title: `All e-books | ${BRAND}`,
    description: 'All TAMYIZ™ e-books: practical guides you can download the moment you buy.',
  },
  philosophy: {
    path: '/philosophy',
    title: `Philosophy and format guide | ${BRAND}`,
    description: 'How TAMYIZ™ e-books are made, and how to read them on your phone, tablet, laptop or Kindle.',
  },
  atelier: {
    path: '/atelier',
    title: `About us | ${BRAND}`,
    description: 'TAMYIZ™ is Basit Majeed and Sahil Naseer: two people writing short, practical e-books on AI and the digital world.',
  },
  downloads: {
    path: '/downloads',
    title: `Download Recovery | ${BRAND}`,
    description: 'Retrieve and renew your purchased TAMYIZ e-book and monograph download links anytime.',
  },
  checkout: {
    path: '/checkout',
    title: `Checkout | ${BRAND}`,
    description: DEFAULT_DESCRIPTION,
    noindex: true,
  },
  admin: {
    path: '/admin',
    title: `Admin Dashboard | ${BRAND}`,
    description: 'TAMYIZ™ Administrative Portal and Operations Console.',
    noindex: true,
  },
  notfound: {
    path: null,
    title: `Page not found | ${BRAND}`,
    description: DEFAULT_DESCRIPTION,
    noindex: true,
  },
};

/** Product text arrives HTML-escaped (see server/catalog.js); turn it back into plain text. */
export const unescapeText = (s) => String(s ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);

/** Meta for one product page (also used by functions/edition/[slug].js on Cloudflare). */
export function productMeta(escaped) {
  const product = { ...escaped, name: unescapeText(escaped.name), tagline: unescapeText(escaped.tagline) };
  const tagline = product.tagline ? `${product.tagline.replace(/[.\s]+$/, '')}. ` : '';
  return {
    path: `/edition/${product.slug}`,
    title: `${product.name} | ${BRAND}`,
    description: `${tagline}E-book, ₹${product.price}, ${product.available ? 'instant PDF download' : 'coming soon, pre-order on WhatsApp'}.`,
    image: product.images && product.images[0] ? product.images[0] : DEFAULT_IMAGE,
    imageSize: null, // covers come in any size
    product,
  };
}

/** Meta for one page. `page` and `slug` are what the router's parseRoute() returns. */
export function pageMeta(page, slug) {
  if (page === 'edition') {
    const product = products.find((p) => p.slug === slug || p.id.toLowerCase() === slug);
    if (!product) return { ...STATIC_PAGES.notfound, image: DEFAULT_IMAGE };
    return productMeta(product);
  }
  if (page === 'legal') {
    const doc = legalDocs[slug] || legalDocs['delivery-protocol'];
    return {
      path: `/legal/${doc.slug}`,
      title: `${doc.title} | ${BRAND}`,
      description: `${doc.title}: ${doc.subtitle}`,
      image: DEFAULT_IMAGE,
    };
  }
  return { ...(STATIC_PAGES[page] || STATIC_PAGES.notfound), image: DEFAULT_IMAGE };
}

/** Every real page address, for the build script and the sitemap. */
export function allPages() {
  return [
    ...['home', 'editions', 'philosophy', 'atelier', 'downloads', 'checkout', 'admin'].map((page) => ({ page, slug: null })),
    ...products.map((p) => ({ page: 'edition', slug: p.slug })),
    ...Object.keys(legalDocs).map((slug) => ({ page: 'legal', slug })),
  ];
}

/** schema.org data for a product page: upgraded to Google Book + Product rich snippet schema. */
export function productSchema(product) {
  const images = (product.images || []).map((src) => (/^https?:/.test(src) ? src : SITE_URL + src));
  return {
    '@context': 'https://schema.org',
    '@type': ['Book', 'Product'],
    name: product.name,
    description: product.tagline || DEFAULT_DESCRIPTION,
    image: images.length ? images : [SITE_URL + DEFAULT_IMAGE],
    bookFormat: 'https://schema.org/EBook',
    inLanguage: 'en',
    author: [
      { '@type': 'Person', name: 'Basit Majeed' },
      { '@type': 'Person', name: 'Sahil Naseer' },
    ],
    publisher: {
      '@type': 'Organization',
      name: 'TAMYIZ™',
      url: SITE_URL,
    },
    brand: { '@type': 'Brand', name: 'TAMYIZ' },
    category: product.category || 'Non-Fiction / Digital Monograph',
    url: `${SITE_URL}/edition/${product.slug}`,
    // aggregateRating is added only from real approved reviews (never a made-up count): see below.
    ...(product.reviewCount > 0 && product.ratingValue
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: String(product.ratingValue), reviewCount: String(product.reviewCount), bestRating: '5', worstRating: '1' } }
      : {}),
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'INR',
      availability: product.available ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
      url: `${SITE_URL}/edition/${product.slug}`,
      seller: {
        '@type': 'Organization',
        name: 'TAMYIZ™',
      },
    },
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The <head> tags for one page, as HTML (between the <!-- seo --> markers in index.html). */
export function headTags(meta) {
  const url = meta.path ? SITE_URL + meta.path : null;
  const image = /^https?:/.test(meta.image) ? meta.image : SITE_URL + meta.image;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    meta.noindex ? `<meta name="robots" content="noindex" />` : '',
    url ? `<link rel="canonical" href="${url}" />` : '',
    `<meta property="og:site_name" content="TAMYIZ™" />`,
    `<meta property="og:type" content="${meta.product ? 'product' : 'website'}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    url ? `<meta property="og:url" content="${url}" />` : '',
    `<meta property="og:image" content="${image}" />`,
    meta.imageSize === null ? '' : `<meta property="og:image:width" content="1200" />`,
    meta.imageSize === null ? '' : `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    meta.product
      ? `<script type="application/ld+json">${JSON.stringify(productSchema(meta.product)).replace(/</g, '\\u003c')}</script>`
      : '',
  ];
  return tags.filter(Boolean).map((t) => '  ' + t).join('\n');
}
