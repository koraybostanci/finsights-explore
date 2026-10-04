/**
 * Content-Security-Policy for a published app, as a Vite plugin.
 *
 * An API key a visitor may enter lives in the browser's storage, so the page only runs
 * scripts that ship with it. Styles allow inline attributes (the charts use them) and the
 * Google Fonts stylesheet. Network calls are limited by `connectSrc`, which each app passes in.
 * Applied to the production build only: the dev server needs inline scripts and a websocket
 * for hot reload.
 *
 * The plugin is typed structurally rather than with Vite's `Plugin`, so shared/ needs no
 * dependencies and this file type-checks from any app directory.
 */

export function cspPolicy(connectSrc: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export interface CspPlugin {
  name: string;
  apply: 'build';
  transformIndexHtml(): Array<{ tag: 'meta'; attrs: Record<string, string>; injectTo: 'head-prepend' }>;
}

/** `connectSrc` is the connect-src source list, e.g. "'self'" or "'self' https:". */
export function csp(connectSrc: string): CspPlugin {
  const content = cspPolicy(connectSrc);
  return {
    name: 'finsights-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
