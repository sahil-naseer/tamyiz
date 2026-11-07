import { defineConfig, loadEnv } from 'vite';
import { route } from './server/router.js';
import { devKV } from './server/dev-kv.js';

// Local dev only: answers /api/* with the same code Cloudflare runs (functions/api/[[path]].js -> server/router.js).
// Settings come from .env (never committed), e.g. TAMYIZ_SANDBOX=true, ADMIN_PASSWORD=... .
// Uploaded ebooks are kept in .local-store/ (git-ignored) instead of Cloudflare KV.
function api(env) {
  const middleware = (req, res, next) => {
    if (!(req.url || '').startsWith('/api/')) return next();
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const hasBody = !['GET', 'HEAD'].includes(req.method);
        const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: hasBody ? Buffer.concat(chunks) : undefined,
          duplex: 'half',
        });
        const response = await route(request, env);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (err) {
        console.error('Local API error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
    });
  };
  return {
    name: 'tamyiz-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), TAMYIZ_STORE: devKV('.local-store') };
  return {
    plugins: [api(env)],
    server: { port: 5173 },
    preview: { port: 4173 },
    build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
  };
});
