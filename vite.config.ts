import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Actual GitHub Pages repository name: https://garrycallme.github.io/flipcube/
const EXPECTED_REPO_NAME = 'flipcube';
const EXPECTED_BASE_PATH = `/${EXPECTED_REPO_NAME}/`;

function normalizeBasePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig(({command}) => {
  const explicitBase = process.env.VITE_BASE_PATH;
  const ghRepoName = process.env.GITHUB_REPOSITORY?.split('/')[1];

  let prodBase = EXPECTED_BASE_PATH;
  if (explicitBase && explicitBase.trim().length > 0) {
    const normalized = normalizeBasePath(explicitBase);
    if (normalized !== EXPECTED_BASE_PATH) {
      throw new Error(
        `Invalid VITE_BASE_PATH "${explicitBase}" (normalized: "${normalized}"). ` +
          `Expected "${EXPECTED_BASE_PATH}" for repository "${EXPECTED_REPO_NAME}".`
      );
    }
    prodBase = normalized;
  } else if (ghRepoName) {
    const normalizedGh = normalizeBasePath(ghRepoName);
    if (normalizedGh !== EXPECTED_BASE_PATH) {
      throw new Error(
        `Unexpected GITHUB_REPOSITORY "${process.env.GITHUB_REPOSITORY}". ` +
          `Expected repository "${EXPECTED_REPO_NAME}" with base "${EXPECTED_BASE_PATH}".`
      );
    }
    prodBase = normalizedGh;
  }

  const base = command === 'serve' && !explicitBase ? '/' : prodBase;

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
