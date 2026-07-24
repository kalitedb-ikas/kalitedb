import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // apps/web/vite.config.ts ile aynı sıra: src altındaki eski derlenmiş .js
    // ikizleri (format.js, api.js) gerçek .ts kaynaklarını gölgelemesin.
    extensions: [".mjs", ".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@": path.resolve(__dirname, "apps/api"),
      "@kalitedb/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@kalitedb/ui": path.resolve(__dirname, "packages/ui/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
