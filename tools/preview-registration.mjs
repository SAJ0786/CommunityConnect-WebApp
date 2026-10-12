// Isolated preview: never imports the real app, Firebase or a service worker.
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuration = {
  configFile: false, root: path.join(project, 'tests/registration-preview'), publicDir: false,
  plugins: [{ name: 'no-live-registration-transport', enforce: 'pre', resolveId(id) {
    if (/firebase|firebase-admin|swService/.test(id)) throw Error('Live transports are forbidden in the registration prototype.');
  } }, react()],
  resolve: { preserveSymlinks: true },
  build: { outDir: path.join(project, '.qa-registration-preview'), emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 5196, strictPort: true },
};
if (!process.argv.includes('--serve-only')) {
  await build(configuration);
  // A fully bundled, offline review file avoids requiring a local server.
  // It contains no runtime data, external assets or live app credentials.
  const output = configuration.build.outDir;
  let html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
  for (const [tag, url] of scripts) {
    const source = await fs.readFile(path.join(output, url.replace(/^\//, '')), 'utf8');
    html = html.replace(tag, () => `<script type="module">${source.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
  for (const [tag, url] of styles) {
    const css = await fs.readFile(path.join(output, url.replace(/^\//, '')), 'utf8');
    html = html.replace(tag, () => `<style>${css}</style>`);
  }
  if (/<(?:script|link)\b[^>]*(?:src|href)=/.test(html)) throw Error('Offline preview still references an external asset.');
  await fs.writeFile(path.join(output, 'registration-preview.html'), html);
  console.log(`Offline preview: ${path.join(output, 'registration-preview.html')}`);
}
if (!process.argv.includes('--build-only')) (await preview(configuration)).printUrls();
