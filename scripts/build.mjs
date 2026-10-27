import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist/electron", { recursive: true });
await build({
  entryPoints: [
    "apps/desktop/electron/main.ts",
    "apps/desktop/electron/preload.ts",
  ],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outdir: "dist/electron",
  outExtension: { ".js": ".cjs" },
  external: ["electron", "node:*"],
  logLevel: "info",
});
