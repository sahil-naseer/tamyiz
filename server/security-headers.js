/**
 * Security headers for responses made by Pages Functions (/api/*, /edition/*, /sitemap.xml).
 * Cloudflare applies public/_headers ONLY to static files, never to Functions responses, so they are added here.
 * Keep CSP in step with public/_headers.
 */
export const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; " +
  'frame-src https://api.razorpay.com https://checkout.razorpay.com; ' +
  "connect-src 'self' https://lumberjack.razorpay.com https://api.razorpay.com; " +
  "img-src 'self' data: blob: https://*.razorpay.com; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

const COMMON = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Returns the response with the security headers added (headers it already has are kept). */
export function withSecurityHeaders(response) {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(COMMON)) if (!res.headers.has(k)) res.headers.set(k, v);
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('text/html') && !res.headers.has('Content-Security-Policy')) res.headers.set('Content-Security-Policy', CSP);
  return res;
}
