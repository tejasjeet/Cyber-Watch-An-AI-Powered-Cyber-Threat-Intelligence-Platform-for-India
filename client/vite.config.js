import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
