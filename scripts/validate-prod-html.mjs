import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_HTML_PATH = path.join(DIST_DIR, 'index.html');
const EXPECTED_BASE = '/flipcube/';
const EXPECTED_ASSETS_PREFIX = `${EXPECTED_BASE}assets/`;

function fail(message) {
  console.error(`[validate-prod-html] FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(DIST_HTML_PATH)) {
  fail(`Missing built HTML entry at ${DIST_HTML_PATH}. Run "vite build" first.`);
}

const html = fs.readFileSync(DIST_HTML_PATH, 'utf8');

if (!html.trim()) {
  fail('dist/index.html is empty.');
}

// 1. Fail immediately if any development entry point remains in dist/index.html
const forbiddenChecks = [
  { label: '/src/main.tsx', regex: /\/src\/main\.tsx/i },
  { label: 'src/main.tsx', regex: /src\/main\.tsx/i },
  { label: 'raw TypeScript script (.ts/.tsx)', regex: /<script\b[^>]*\bsrc=["'][^"']+\.(?:ts|tsx)(?:\?[^"']*)?["'][^>]*>/i },
];

for (const check of forbiddenChecks) {
  if (check.regex.test(html)) {
    fail(`dist/index.html contains forbidden development reference: ${check.label}`);
  }
}

// 2. Collect all <script ...> and <link ...> tags regardless of attribute order
const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
const moduleJsScripts = [];
for (const tag of scriptTags) {
  const isModule = /\btype=["']module["']/i.test(tag);
  const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
  if (isModule && srcMatch) {
    moduleJsScripts.push(srcMatch[1]);
  }
}

const flipcubeJsScripts = moduleJsScripts.filter(
  (src) => src.startsWith(EXPECTED_ASSETS_PREFIX) && src.endsWith('.js')
);

if (flipcubeJsScripts.length === 0) {
  fail(
    `dist/index.html must reference at least one built JS module under ${EXPECTED_ASSETS_PREFIX}*.js. Found module scripts: ${JSON.stringify(moduleJsScripts)}`
  );
}

const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
const stylesheetHrefs = [];
for (const tag of linkTags) {
  const isStylesheet = /\brel=["']stylesheet["']/i.test(tag);
  const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
  if (isStylesheet && hrefMatch) {
    stylesheetHrefs.push(hrefMatch[1]);
  }
}

const flipcubeCssLinks = stylesheetHrefs.filter(
  (href) => href.startsWith(EXPECTED_ASSETS_PREFIX) && href.endsWith('.css')
);

if (flipcubeCssLinks.length === 0) {
  fail(
    `dist/index.html must reference at least one built CSS stylesheet under ${EXPECTED_ASSETS_PREFIX}*.css. Found stylesheets: ${JSON.stringify(stylesheetHrefs)}`
  );
}

// 3. Verify every referenced /flipcube/assets/* file exists on disk in dist/assets/ and is non-empty
for (const assetUrl of [...flipcubeJsScripts, ...flipcubeCssLinks]) {
  const relativePath = assetUrl.slice(EXPECTED_BASE.length);
  const fullPath = path.join(DIST_DIR, relativePath);

  if (!fs.existsSync(fullPath)) {
    fail(`Referenced production asset "${assetUrl}" is missing on disk at ${fullPath}`);
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile() || stat.size === 0) {
    fail(`Referenced production asset "${assetUrl}" at ${fullPath} is empty or invalid`);
  }
}

console.log('[validate-prod-html] PASS: dist/index.html references valid /flipcube/assets/ bundles.');
console.log(`  JS:  ${flipcubeJsScripts.join(', ')}`);
console.log(`  CSS: ${flipcubeCssLinks.join(', ')}`);
