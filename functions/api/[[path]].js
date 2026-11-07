// Cloudflare Pages Function for every /api/* address. All logic lives in server/router.js.
import { route } from '../../server/router.js';
import { withSecurityHeaders } from '../../server/security-headers.js';

export const onRequest = async ({ request, env }) => withSecurityHeaders(await route(request, env));
