import { build, preview } from 'vite';
import path from 'node:path';
import config from '../vite.config.js';
const root = path.resolve('tests/workspace-preview');
const testConfig = { ...config, configFile: false, root, envDir: root, publicDir: path.resolve('public'),
  // Keep logical dependency paths for the shared node_modules junction on Windows.
  resolve: { ...config.resolve, preserveSymlinks: true },
  plugins: [{ name: 'offline-directory-workspace', enforce: 'pre', resolveId(id, importer) {
    if (!importer) return;
    if (/\/services\/public(Business|Promotion)Service$/.test(id)) return path.join(root,'services.mjs');
    if (/\/services\/cityCatalogue$/.test(id)) return path.join(root,'services.mjs');
    if (id === './App.jsx') return path.resolve('tests/public-preview/legacy.jsx');
    if (id.startsWith('firebase/')) throw new Error('Firebase must not enter the offline workspace preview');
  } }, ...config.plugins.slice(0,1)],
  build: { ...config.build, outDir: path.resolve('.qa-workspace-preview'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 5184, strictPort: true },
};
if (!process.argv.includes('--serve-only')) await build(testConfig);
if (!process.argv.includes('--build-only')) (await preview(testConfig)).printUrls();
