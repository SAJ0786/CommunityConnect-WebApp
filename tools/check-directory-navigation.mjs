// Real AppRouter, App, EventCard and Directory UI; synthetic services only.
import { build, preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import config from '../vite.config.js';
const root = path.resolve('tests/member-preview');
const mocks = path.resolve('tests/directory-navigation-mocks.jsx');
const pureServices = ['dateUtils', 'hijriService', 'prayerTimeService', 'calendarService', 'imageService', 'hijriObservanceService', 'recurrenceService'];
const stubPages = ['AddEvent', 'EditEvent', 'AISearch', 'MyEvents', 'Profile', 'AdminDashboard', 'StreamCard', 'Favourites', 'BulkShare', 'InstallApp', 'CalendarView', 'StreamedVideos', 'HijriCalendar', 'HostInbox'];
const testConfig = { ...config, configFile: false, root, publicDir: path.resolve('public'), envDir: root,
  define: { ...config.define, 'import.meta.env.VITE_DIRECTORY_WORKSPACE_ENABLED': '"true"',
    'import.meta.env.VITE_READ_ONLY_PREVIEW': '"false"', 'import.meta.env.VITE_EVENT_REGISTRATION_ENABLED': '"false"' },
  resolve: { ...config.resolve, preserveSymlinks: true },
  plugins: [{ name: 'offline-directory-navigation', enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !importer.replaceAll('\\', '/').includes('/src/')) return;
      if (id.startsWith('firebase/') || /\/firebase\/firebase$/.test(id)
        || /\/services\/(userService|cityCatalogue|publicBusinessService|publicPromotionService)$/.test(id)
        || /\/directory\/(liveSession|gateway)\.mjs$/.test(id)) return mocks;
      if (id === './pages/Home') return '\0navigation-home';
      if (stubPages.some(name => id === './pages/' + name)) return '\0navigation-empty';
      if (/\/services\//.test(id) && !pureServices.includes(id.split('/').pop().replace(/\.js$/, ''))) {
        return '\0navigation-service:' + path.resolve(path.dirname(importer), id + (path.extname(id) ? '' : '.js'));
      }
    },
    load(id) {
      if (id.replaceAll('\\', '/') === path.join(root, 'preview.jsx').replaceAll('\\', '/')) return `import React from 'react'; import {createRoot} from 'react-dom/client'; import AppRouter from '../../src/AppRouter'; import '../../src/styles/theme.css'; createRoot(document.getElementById('root')).render(<AppRouter/>);`;
      if (id === '\0navigation-home') return `export {Home as default} from ${JSON.stringify(mocks)};`;
      if (id === '\0navigation-empty') return 'export default function Empty() { return null; }';
      if (!id.startsWith('\0navigation-service:')) return;
      const source = fs.readFileSync(id.slice('\0navigation-service:'.length), 'utf8');
      const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(match => match[1]);
      return `import {service} from ${JSON.stringify(mocks)};\n` + names.map(name => `export const ${name} = service(${JSON.stringify(name)});`).join('\n');
    },
  }, ...config.plugins.slice(0, 1)],
  build: { ...config.build, outDir: path.resolve('.qa-directory-navigation'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 5186, strictPort: true },
};
await build(testConfig);
if (!process.argv.includes('--build-only')) (await preview(testConfig)).printUrls();
