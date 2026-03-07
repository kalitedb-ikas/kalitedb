import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
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
