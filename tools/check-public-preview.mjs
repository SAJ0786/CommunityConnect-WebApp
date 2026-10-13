import { build, preview } from 'vite';
import path from 'node:path';
import config from '../vite.config.js';
const root = path.resolve('tests/public-preview');
const testConfig = { ...config, configFile: false, root, publicDir: path.resolve('public'), envDir: root,
  plugins: [{ name: 'offline-public-directory', enforce: 'pre', resolveId(id, importer) {
    if (!importer) return;
    if (/\/services\/public(Business|Promotion)Service$/.test(id)) return path.join(root, 'services.js');
    if (id === './App.jsx') return path.join(root, 'legacy.jsx');
    if (id.startsWith('firebase/')) throw new Error('Firebase is forbidden in the offline public fixture');
  } }, ...config.plugins.slice(0, 1)],
  build: { ...config.build, outDir: path.resolve('.qa-public-preview'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 5183, strictPort: true },
};
await build(testConfig);
if (!process.argv.includes('--build-only')) (await preview(testConfig)).printUrls();
