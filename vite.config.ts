import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
        copyFileSync('public/manifest.json', 'dist/manifest.json');
        const iconsDir = 'dist/icons';
        if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
        for (const size of ['16', '48', '128']) {
          const src = `public/icons/icon${size}.png`;
          if (existsSync(src)) copyFileSync(src, `${iconsDir}/icon${size}.png`);
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});