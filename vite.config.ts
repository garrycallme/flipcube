import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Default GitHub Pages repository name when deploying to https://USERNAME.github.io/cube-flip/
const DEFAULT_GITHUB_REPO = 'cube-flip';

function normalizeBasePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig(({command}) => {
  // Precedence for production build base path:
  // 1. Explicit VITE_BASE_PATH (e.g. '/my-repo/' or '/' for custom domains)
  // 2. GitHub Actions GITHUB_REPOSITORY ('owner/repo-name' -> '/repo-name/')
  // 3. Documented default repository name ('/cube-flip/')
  const ghRepoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const explicitBase = process.env.VITE_BASE_PATH;
  const prodBase = explicitBase
    ? normalizeBasePath(explicitBase)
    : ghRepoName
      ? normalizeBasePath(ghRepoName)
      : `/${DEFAULT_GITHUB_REPO}/`;

  const base = command === 'serve' && !explicitBase ? '/' : prodBase;

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
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
