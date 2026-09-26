import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port 5175 is this project's slot: 5173 and 4000 belong to other apps on this machine.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
});
