import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 纯离线工程：base 使用相对路径，确保 Capacitor 以 file:// / capacitor:// 协议读取本地资源
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    // 全部资源本地化，无任何 CDN
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
