// Builds the real App auth orchestration with synthetic services and lightweight
// destination stubs. Nothing in this entry is included in the production build.
import { build, preview } from 'vite';
import path from 'node:path';
import config from '../vite.config.js';
const root = path.resolve('tests/member-preview');
const mocks = path.join(root, 'mocks.js');
const stubPages = ['AddEvent', 'EditEvent', 'AISearch', 'MyEvents', 'Profile', 'AdminDashboard', 'StreamCard', 'Favourites', 'BulkShare', 'InstallApp', 'CalendarView', 'StreamedVideos', 'HijriCalendar', 'BusinessDirectory', 'Home'];
const stubComponents = ['Header', 'BottomNav', 'AppWalkthrough', 'Toast', 'ShareSheet', 'DefaultCityPrompt'];
const testConfig = { configFile: false, root, publicDir: false,
  plugins: [{ name: 'offline-member-fixtures', enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !importer.replaceAll('\\', '/').includes('/src/')) return;
      if (['firebase/auth', 'firebase/functions'].includes(id) || /\/firebase\/firebase$/.test(id)
        || /\/services\/(userService|eventService|notificationService)$/.test(id)) return mocks;
      if (stubPages.some(name => id === './pages/' + name)) return '\0fixture-page:' + id.split('/').pop();
      if (stubComponents.some(name => id === './components/' + name)) return '\0fixture-empty';
    },
    load(id) {
      if (id === '\0fixture-empty') return 'export default function Empty() { return null; }';
      if (id.startsWith('\0fixture-page:')) return `import React from 'react'; export default function Page() { return React.createElement('h1', null, ${JSON.stringify('Destination: ' + id.split(':')[1])}); }`;
    },
  }, ...config.plugins.slice(0, 1)],
  build: { outDir: path.resolve('.qa-member-preview'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true },
};
await build(testConfig);
if (!process.argv.includes('--build-only')) {
  const server = await preview(testConfig);
  server.printUrls();
}
