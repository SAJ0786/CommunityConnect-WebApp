import { build, preview } from 'vite';
import path from 'node:path';
import config from '../vite.config.js';
const root = path.resolve('tests/firebase-integration');
const embedded = process.argv.includes('--in-site-preview');
const settings = { ...config, configFile: false, root, envDir: root, publicDir: false,
  base: embedded ? '/firebase-review/' : '/',
  resolve: { ...config.resolve, preserveSymlinks: true },
  plugins: [{ name: 'isolated-directory-boundary', enforce: 'pre', resolveId(id, importer) {
    if (!importer) return;
    if (/\/services\/public(Business|Promotion)Service$/.test(id)) return path.resolve('tests/workspace-preview/services.mjs');
    if (/\/firebase\/firebase(?:\.js)?$/.test(id)) throw new Error('Production Firebase must not enter the isolated workspace.');
  } }, ...config.plugins.slice(0, 1)],
  build: { ...config.build, outDir: path.resolve(embedded ? '.qa-site-preview/firebase-review' : '.qa-firebase-preview'), emptyOutDir: true,
    rollupOptions: { ...config.build?.rollupOptions, onwarn(warning, warn) {
      if (warning.code === 'MISSING_EXPORT') throw new Error(warning.message);
      warn(warning);
    } },
  },
  preview: { host: '127.0.0.1', port: 5187, strictPort: true },
};
if (!process.argv.includes('--serve-only')) await build(settings);
if (!process.argv.includes('--build-only')) (await preview(settings)).printUrls();
