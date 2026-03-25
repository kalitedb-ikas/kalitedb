import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy: NonNullable<UserConfig["server"]>["proxy"] = {
  "/api": {
    target: "http://localhost:3001",
    changeOrigin: true
  }
};

export default defineConfig({
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
