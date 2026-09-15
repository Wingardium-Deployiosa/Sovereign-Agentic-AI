import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    watch: {
      ignored: ['**/dist/**', '**/backend/**', '**/.git/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Disable buffering for SSE streaming endpoints
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Check if this is an SSE response
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              // Disable response buffering for real-time token streaming
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
