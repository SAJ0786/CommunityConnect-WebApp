import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

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
