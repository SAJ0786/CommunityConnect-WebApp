// Use Vite's API to avoid its temporary esbuild config loader on Windows sandboxes.
// The application's actual Vite config is still used unchanged.
import { build, preview } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import config from '../vite.config.js';

if (process.argv.includes('--live-preview')) {
  const index = process.argv.indexOf('--env-file');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Supply the existing web --env-file; no credentials are copied into source.');
  const envText = fs.readFileSync(process.argv[index + 1], 'utf8');
  const define = { ...config.define, 'import.meta.env.VITE_LOCAL_PREVIEW': JSON.stringify('true') };
  for (const match of envText.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]+)["']?\s*$/gm)) {
    if (match[1] !== 'VITE_LOCAL_PREVIEW') define[`import.meta.env.${match[1]}`] = JSON.stringify(match[2].trim());
  }
  const liveConfig = { ...config, configFile: false, define,
    plugins: config.plugins.slice(0, 1),
    build: { ...config.build, outDir: '.qa-web-live', emptyOutDir: true },
    preview: { host: 'localhost', port: 5180, strictPort: true },
  };
  await build(liveConfig);
  if (!process.argv.includes('--build-only')) {
    const server = await preview(liveConfig);
    server.printUrls();
  }
} else if (process.argv.includes('--preview')) {
  const previewConfig = {
    configFile: false, plugins: config.plugins.slice(0, 1),
    root: path.resolve('tests/preview'), publicDir: false,
    build: { outDir: path.resolve('.qa-web-preview'), emptyOutDir: true },
    preview: { host: '127.0.0.1', port: 5179, strictPort: true },
  };
  await build(previewConfig);
  const server = await preview(previewConfig);
  server.printUrls();
} else {
  // The workspace shares installed dependencies through a Windows junction.
  // Match the other local build helpers without changing the deployment config.
  await build({ ...config, configFile: false, resolve:{ ...config.resolve, preserveSymlinks:true } });
}
