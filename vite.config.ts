import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The client lives in web/ and builds into dist/, which the server serves.
// In development, `pnpm dev:server` runs the API on :8080 and Vite proxies to it.
export default defineConfig({
  root: "web",
  plugins: [vue()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/readme": "http://localhost:8080",
    },
  },
});
