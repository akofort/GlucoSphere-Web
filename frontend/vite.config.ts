import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Set by docker-compose build args (see AboutPage.tsx) -- the server's build context has no
    // .git directory (only synced source files), so these are computed on the machine that
    // triggers the build and passed through, not read from git at build time.
    __BUILD_SHA__: JSON.stringify(process.env.VITE_BUILD_SHA || "dev"),
    __BUILD_TIME__: JSON.stringify(process.env.VITE_BUILD_TIME || ""),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
