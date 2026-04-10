import type { Config } from "tailwindcss";

import { brand, semantic } from "./src/theme/colors";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
        soft: "0 1px 3px rgba(0, 0, 0, 0.04)",
        medium: "0 4px 16px -2px rgba(0, 0, 0, 0.06)",
        strong: "0 8px 24px -4px rgba(0, 0, 0, 0.08)",
        glass: "0 24px 70px rgba(15, 23, 42, 0.14)",
        "glass-strong": "0 34px 95px rgba(15, 23, 42, 0.2)"
      },
      colors: {
        primary: brand.primary,
        accent: brand.accent,
        surface: {
          DEFAULT: "#f8f9fb",
          50: "#ffffff",
          100: "#f8f9fb",
          200: "#f1f3f5",
          300: "#e5e7eb",
          400: "#d1d5db"
        },
        brand: {
          ink: "#111827",
          orange: brand.primary,
          violet: brand.accent,
          emerald: brand.emerald,
          rose: brand.rose,
          sand: "#F5E6C8"
        },
        semantic: {
          success: semantic.success,
          warning: semantic.warning,
          danger: semantic.danger,
          muted: semantic.textSecondary
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Manrope", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      borderRadius: {
        "2xl": "10px",
        "3xl": "10px"
      }
    }
  },
  plugins: []
};

export default config;
