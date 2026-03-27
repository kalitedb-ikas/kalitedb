/**
 * Uygulama renkleri — tek kaynak.
 * Tailwind (`tailwind.config.ts`) ve `index.css` içindeki `--semantic-*` ile aynı hex değerlerini koruyun.
 */

export const brand = {
  primary: "#F97316",
  accent: "#8B5CF6",
  emerald: "#10B981",
  rose: "#F43F5E",
  sky: "#38BDF8",
  ink: "#0F172A"
} as const;

export const semantic = {
  success: "#059669",
  warning: "#D97706",
  danger: "#E11D48",
  textSecondary: "#475569"
} as const;

/** Açık tema grafikleri (Recharts): grid, eksen, tooltip */
export const chart = {
  grid: "#E2E8F0",
  gridMuted: "#F3F4F6",
  /** Eksen etiketleri — açık zeminde okunabilirlik */
  axis: "#475569",
  axisMuted: "#64748B",
  axisStrong: "#334155",
  tooltipBg: "#FFFFFF",
  tooltipText: brand.ink,
  tooltipBorder: "rgba(226, 232, 240, 0.9)",
  tooltipShadow: "0 18px 48px rgba(15, 23, 42, 0.12)",
  barDefault: brand.primary,
  barAlternate: "#FDBA74",
  barAccent: brand.accent,
  barAccentMuted: "#C4B5FD"
} as const;

/** Koyu slayt / sunum grafikleri */
export const chartDark = {
  bg: brand.ink,
  grid: "rgba(255, 255, 255, 0.08)",
  tick: "rgba(255, 255, 255, 0.56)",
  tickStrong: "rgba(255, 255, 255, 0.72)",
  border: "rgba(255, 255, 255, 0.12)",
  tooltipText: "#FFFFFF"
} as const;

/** Çok serili grafikler (sıralı renk döngüsü) */
export const chartSeriesPalette: readonly string[] = [
  brand.primary,
  brand.accent,
  brand.sky,
  brand.emerald,
  brand.rose
];

export const chartTooltipLight = {
  background: chart.tooltipBg,
  border: `1px solid ${chart.tooltipBorder}`,
  borderRadius: 18,
  boxShadow: chart.tooltipShadow,
  color: chart.tooltipText
} as const;

export const chartTooltipDark = {
  background: chartDark.bg,
  border: `1px solid ${chartDark.border}`,
  borderRadius: 18,
  color: chartDark.tooltipText
} as const;
