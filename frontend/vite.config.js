import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': backendTarget,
      '/links': backendTarget,
      '/stats': backendTarget,
      '/health': backendTarget,
      '/verify-password': backendTarget,
      '/password-prompt': backendTarget
    }
  }
});
