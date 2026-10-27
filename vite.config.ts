import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: "apps/desktop",
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@azeroth-weekly/protocol": fileURLToPath(
        new URL("./packages/protocol/src/index.ts", import.meta.url),
      ),
    },
  },
  build: { outDir: "../../dist/renderer", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
