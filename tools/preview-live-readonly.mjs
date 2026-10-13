import { build, preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import config from '../vite.config.js';
import { blockedExports, notificationPreviewModule } from './readonly-preview-policy.mjs';

const envIndex = process.argv.indexOf('--env-file');
const serveOnly = process.argv.includes('--serve-only');
if (!serveOnly && (envIndex < 0 || !process.argv[envIndex+1])) throw new Error('Supply --env-file with the existing web Firebase configuration.');
const env = serveOnly ? '' : fs.readFileSync(process.argv[envIndex+1],'utf8');
const define = { ...config.define, 'import.meta.env.VITE_LOCAL_PREVIEW':JSON.stringify('true'), 'import.meta.env.VITE_READ_ONLY_PREVIEW':JSON.stringify('true') };
for (const match of env.matchAll(/^\s*(VITE_FIREBASE_[A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]+)["']?\s*$/gm)) define[`import.meta.env.${match[1]}`]=JSON.stringify(match[2].trim());
if (!serveOnly && (!define['import.meta.env.VITE_FIREBASE_API_KEY'] || JSON.parse(define['import.meta.env.VITE_FIREBASE_PROJECT_ID'] || 'null') !== 'community-event-8b639')) throw new Error('Expected the existing Community Connect Firebase web configuration.');
const markerPath = path.resolve('.qa-site-preview/readonly-preview.json');
if (serveOnly) {
  const marker = JSON.parse(fs.readFileSync(markerPath,'utf8'));
  if (marker.mode !== 'read-only' || marker.projectId !== 'community-event-8b639') throw new Error('Build the read-only preview before serving it.');
}
const policy = path.resolve('tools/readonly-preview-policy.mjs');
const settings = { ...config, configFile:false, define,
  resolve:{ ...config.resolve, preserveSymlinks:true },
  plugins:[{ name:'read-only-live-preview', enforce:'pre',
    resolveId(id,importer) {
      if (!importer || importer.startsWith('\0readonly-sdk:') || importer.replaceAll('\\','/').includes('/node_modules/')) return;
      const kind = id.replace('firebase/','');
      if (id.startsWith('firebase/') && blockedExports[kind]) return '\0readonly-sdk:'+kind;
      if (/\/services\/notificationService(?:\.js)?$/.test(id)) return '\0readonly-notifications';
    },
    load(id) {
      if (id === '\0readonly-notifications') {
        const source=fs.readFileSync('src/services/notificationService.js','utf8');
        return notificationPreviewModule(source);
      }
      if (!id.startsWith('\0readonly-sdk:')) return;
      const kind=id.slice('\0readonly-sdk:'.length);
      const names=[...blockedExports[kind],...(kind==='auth'?['setPersistence']:[])];
      return `import * as sdk from 'firebase/${kind}'; import {guardSdk} from ${JSON.stringify(policy)}; export * from 'firebase/${kind}'; const guarded=guardSdk(sdk,'${kind}');\n`+names.map(name=>`export const ${name}=guarded.${name};`).join('\n');
    },
    transform(source,id) {
      if (!id.replaceAll('\\','/').endsWith('/src/App.jsx')) return;
      return source.replace('Local development build · live Firebase connection. Sign-in uses your real account. Nothing has been published.','Local read-only preview · Sign in with your existing account. Editing, uploads and registration are disabled.')
        .replace('Local development build · live data. Changes you make affect your real account.','Local read-only preview · Real Firebase data and images · Changes and uploads are disabled.');
    },
    transformIndexHtml(html) { return html.replace('<head>','<head><meta name="robots" content="noindex,nofollow">'); },
  },...config.plugins.slice(0,1)],
  build:{ ...config.build, outDir:path.resolve('.qa-site-preview'), emptyOutDir:true },
  preview:{host:'127.0.0.1',port:5186,strictPort:true},
};
if (!serveOnly) {
  await build(settings);
  fs.writeFileSync(markerPath,JSON.stringify({mode:'read-only',projectId:'community-event-8b639',builtAt:new Date().toISOString()}));
}
if (!process.argv.includes('--build-only')) (await preview(settings)).printUrls();
