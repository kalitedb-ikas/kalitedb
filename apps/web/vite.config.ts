import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy: NonNullable<UserConfig["server"]>["proxy"] = {
  "/api": {
    target: "http://localhost:3001",
    changeOrigin: true
  }
};

function normalizeBasePath(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_PUBLIC_BASE_PATH),
  plugins: [react()],
  resolve: {
    extensions: [".mjs", ".ts", ".tsx", ".js", ".jsx", ".json"]
  },
  server: {
    port: 5173,
    proxy: apiProxy
  },
  preview: {
    proxy: apiProxy
  }
});
