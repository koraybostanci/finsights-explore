import { defineConfig } from 'vite';
import { csp } from '../../shared/src/vite-csp.ts';

// Learn makes no network calls of its own: only the page's own origin is allowed.
const CONNECT_SRC = "'self'";

export default defineConfig({
  // './' keeps asset URLs relative, so the build works from any path or host.
  base: './',
  build: { target: 'es2022', sourcemap: true },
  // @fintools/shared is linked from ../../shared, outside this project root.
  // Without this the dev server answers cold requests for shared files with 403.
  server: { fs: { allow: ['../..'] } },
  plugins: [csp(CONNECT_SRC)],
});
