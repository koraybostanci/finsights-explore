import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy for the published site.
 *
 * The API key a visitor may enter lives in the browser's storage, so the page only runs
 * scripts that ship with it. Styles allow inline attributes (the charts use them) and the
 * Google Fonts stylesheet; network calls go to the site itself and to AI providers over
 * https (or a local model on localhost). Applied to the production build only: the dev
 * server needs inline scripts and a websocket for hot reload.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'finsights-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// base './' keeps every asset URL relative, so the build works under
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  plugins: [csp()],
});
