import { SITE_URL as DEFAULT_SITE_URL } from '../src/data/site-config.js';

export { DEFAULT_SITE_URL };

/** Normalized public site URL without a trailing slash (`env.SITE_URL` overrides default). */
export function getSiteUrl(env = {}) {
  const raw = String((env && env.SITE_URL) || DEFAULT_SITE_URL).trim();
  const normalized = raw.replace(/\/+$/, '');
  if (!normalized) return DEFAULT_SITE_URL;
  try {
    const parsed = new URL(normalized.includes('://') ? normalized : `https://${normalized}`);
    return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Hostname (including port if any) for email footers and notices. */
export function getSiteHost(env = {}) {
  try {
    return new URL(getSiteUrl(env)).host;
  } catch {
    return new URL(DEFAULT_SITE_URL).host;
  }
}
