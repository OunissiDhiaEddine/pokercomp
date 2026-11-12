import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Serves /api/room from the same handler Vercel uses (memory store locally). */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/room')) return next();
        try {
          const { handle } = await server.ssrLoadModule('/api/_lib/handler.ts');
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await handle(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await response.text());
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end('{"error":"dev_error"}');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    devApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'PokerComp — Poker Chips',
        short_name: 'PokerComp',
        description: "Virtual Texas Hold'em chips for your real card game. No sign-up, just a game code.",
        theme_color: '#0b1f17',
        background_color: '#07140f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: { host: true },
});
