import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // The released app version, single-sourced from package.json -- shown on the About page. Unlike
    // the build stamps below this is always present, so /settings/about never ends up with no
    // version information at all (which is what happened when a deploy forgot the build args).
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Set by docker-compose build args (see AboutPage.tsx) -- the server's build context has no
    // .git directory (only synced source files), so these are computed on the machine that
    // triggers the build and passed through, not read from git at build time. deploy.sh fills
    // both in automatically; a manual `docker compose build` without them falls back to "dev".
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
