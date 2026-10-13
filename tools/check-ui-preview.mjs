// Real visual components, synthetic services. No App authentication orchestration.
import { build, preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import config from '../vite.config.js';
const root = path.resolve('tests/ui-preview');
const mocks = path.join(root, 'mocks.js');
const embedded = process.argv.includes('--in-site-preview');
const portArgument = process.argv.find(argument => argument.startsWith('--port='));
const previewPort = portArgument ? Number(portArgument.slice('--port='.length)) : 5182;
if (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65535) {
  throw new Error('Use --port=NUMBER with an integer from 1024 to 65535.');
}
if (embedded && !fs.existsSync('.qa-site-preview/readonly-preview.json')) throw new Error('Build the read-only preview first.');
const pureServices = ['dateUtils', 'hijriService', 'prayerTimeService', 'calendarService', 'imageService', 'hijriObservanceService', 'recurrenceService'];
const testConfig = { ...config, configFile: false, root, publicDir: path.resolve('public'), envDir:root,
  base:embedded ? '/ui-review/' : '/', resolve:{ ...config.resolve, preserveSymlinks:true },
  plugins: [{ name: 'offline-visual-services', enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !importer.replaceAll('\\', '/').includes('/src/')) return;
      if (id.startsWith('firebase/') || /\/firebase\/firebase$/.test(id)) return mocks;
      if ((/\/services\//.test(id) || importer.replaceAll('\\', '/').includes('/src/services/') && id.startsWith('./')) && !pureServices.includes(id.split('/').pop().replace(/\.js$/, ''))) {
        const file = path.resolve(path.dirname(importer), id + (path.extname(id) ? '' : '.js'));
        return '\0offline-service:' + file;
      }
    },
    load(id) {
      if (!id.startsWith('\0offline-service:')) return;
      const file = id.slice('\0offline-service:'.length);
      const source = fs.readFileSync(file, 'utf8');
      const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m => m[1]);
      return `import { service } from ${JSON.stringify(mocks)};\n` + names.map(name => `export const ${name} = service(${JSON.stringify(name)});`).join('\n');
    },
  }, ...config.plugins.slice(0, 1)],
  build: { ...config.build, outDir: path.resolve(embedded ? '.qa-site-preview/ui-review' : '.qa-ui-preview'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
};
await build(testConfig);
if (!process.argv.includes('--build-only')) (await preview(testConfig)).printUrls();
