import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single self-contained HTML so the build can be published as one page.
export default defineConfig({
  plugins: [viteSingleFile()],
  base: "./",
  server: { host: true, port: 5180 },
  build: { target: "es2020", assetsInlineLimit: 100_000_000 },
});
