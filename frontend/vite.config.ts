import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    // Optimized chunk splitting for better caching and smaller initial load
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime (~140KB) — cached long-term, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Data layer (~40KB)
          'vendor-data': ['@tanstack/react-query', 'zustand', 'axios'],
          // D3 visualization (~50KB with selective imports)
          'vendor-d3': ['d3-selection', 'd3-zoom', 'd3-force', 'd3-drag', 'd3-dispatch', 'd3-timer', 'd3-quadtree'],
          // Chart.js (~200KB) — only loaded on Monitoring page
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          // Terminal (~350KB) — only loaded on Terminal page
          'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'],
        },
      },
    },
    // Increase chunk size warning limit (vendor chunks are expected to be larger)
    chunkSizeWarningLimit: 600,
  },
});
