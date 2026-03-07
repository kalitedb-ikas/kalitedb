import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 20px 45px -25px rgba(15, 23, 42, 0.25)"
      },
      colors: {
        brand: {
          ink: "#0B2239",
          coral: "#EB7155",
          sand: "#F5E6C8",
          mint: "#A7D6C4",
          cloud: "#F7F8FA"
        }
      },
      fontFamily: {
        sans: ["Space Grotesk", "Manrope", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;

