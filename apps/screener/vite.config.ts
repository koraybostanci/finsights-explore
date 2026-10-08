import { defineConfig } from 'vite';
import { csp } from '../../shared/src/vite-csp.ts';

/**
 * Network calls go to the site itself and to AI providers over https
 * (or a local model on localhost). The rest of the policy is in shared/src/vite-csp.ts.
 */
const CONNECT_SRC = "'self' https: http://localhost:* http://127.0.0.1:*";

// base './' keeps every asset URL relative, so the build works from any host or path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  // @fintools/shared is linked from ../../shared, outside this project root; allow only it (and the project).
  // Without this the dev server answers cold requests for shared files with 403.
  server: { fs: { allow: ['.', '../../shared'] } },
  plugins: [csp(CONNECT_SRC)],
});
