import { defineConfig } from 'vite';

// base './' keeps every asset URL relative, so the build works under
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
});
