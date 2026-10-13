import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Serve the identical palette to standalone help/policy pages in dev and builds.
// The source stylesheet remains the single editable copy.
const themeSource = new URL('./src/styles/tokens.css', import.meta.url);
const themePublic = new URL('./public/theme-tokens.css', import.meta.url);
fs.writeFileSync(themePublic, '/* Generated from src/styles/tokens.css; do not edit. */\n' + fs.readFileSync(themeSource, 'utf8'));

// Plugin: stamp build timestamp into sw.js after build
function stampServiceWorker() {
  return {
    name: 'stamp-sw',
    closeBundle() {
      const swPath = path.resolve('dist/sw.js');
      if (fs.existsSync(swPath)) {
        const buildTime = Date.now();
        let content = fs.readFileSync(swPath, 'utf8');
        content = content.replace('__BUILD_TIME__', buildTime);
        const assetsDirectory = path.resolve('dist/assets');
        const assets = fs.existsSync(assetsDirectory)
          ? fs.readdirSync(assetsDirectory).filter(name => /\.(js|css|woff2?|png|jpe?g|webp|svg)$/i.test(name)).map(name => `/assets/${name}`).sort()
          : [];
        content = content.replace('/* __BUILD_ASSETS__ */ []', JSON.stringify(assets));
        fs.writeFileSync(swPath, content);
        console.log(`[stamp-sw] Cache version stamped: ce-v${buildTime}`);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  define: {
    // Injected at build time — used to show "Build Number" in Profile > About
    __APP_BUILD_TIME__: JSON.stringify(Date.now()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':      ['react', 'react-dom'],
          'firebase-app':      ['firebase/app'],
          'firebase-auth':     ['firebase/auth'],
          'firebase-firestore':['firebase/firestore'],
          'firebase-functions':['firebase/functions'],
        }
      }
    }
  }
});
