import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Free-plan guard: both apps must stay assets-only Workers (see README, "Free plan only").
const NOTE = 'The project must stay on the Cloudflare free plan: static assets only, no Worker script or paid bindings (README, "Free plan only").';
const APPS = ['learn', 'screener'];
const ALLOWED_TOP = new Set(['$schema', 'name', 'compatibility_date', 'assets']);
const ALLOWED_ASSETS = new Set(['directory']);

const appPath = (app: string, file: string) =>
  fileURLToPath(new URL(`../../apps/${app}/${file}`, import.meta.url));

/** Removes // and /* *\/ comments and trailing commas outside of strings. */
function parseJsonc(text: string): Record<string, unknown> {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

for (const app of APPS) {
  const config = parseJsonc(readFileSync(appPath(app, 'wrangler.jsonc'), 'utf8'));

  test(`${app}: wrangler.jsonc has only allowed top-level keys and no main`, () => {
    assert.ok(!('main' in config), `"main" adds a Worker script. ${NOTE}`);
    for (const key of Object.keys(config)) {
      assert.ok(ALLOWED_TOP.has(key), `Key "${key}" in apps/${app}/wrangler.jsonc is not allowed (allowed: ${[...ALLOWED_TOP].join(', ')}). ${NOTE}`);
    }
  });

  test(`${app}: assets has only a directory`, () => {
    const assets = config.assets;
    assert.ok(assets && typeof assets === 'object' && !Array.isArray(assets), `"assets" must be an object. ${NOTE}`);
    for (const key of Object.keys(assets)) {
      assert.ok(ALLOWED_ASSETS.has(key), `Key "assets.${key}" in apps/${app}/wrangler.jsonc is not allowed (e.g. run_worker_first runs Worker code). ${NOTE}`);
    }
    assert.equal(typeof (assets as Record<string, unknown>).directory, 'string');
  });

  test(`${app}: Worker name is fintools-${app}`, () => {
    assert.match(String(config.name), /^fintools-(learn|screener)$/);
    assert.equal(config.name, `fintools-${app}`);
  });

  test(`${app}: no Pages Functions or advanced-mode Worker in public/`, () => {
    for (const file of ['functions', '_worker.js', 'public/functions', 'public/_worker.js']) {
      assert.ok(!existsSync(appPath(app, file)), `apps/${app}/${file} would run Worker code. ${NOTE}`);
    }
  });
}
