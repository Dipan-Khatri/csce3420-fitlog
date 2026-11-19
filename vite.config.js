import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app lives in client/. In development Vite serves it on :5173 and
// forwards /api requests to the Express server on :3000.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
