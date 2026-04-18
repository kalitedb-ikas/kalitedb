export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${formatNumber(value, digits)}%`;
}

export function formatAuditScore(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return formatNumber(value, Number.isInteger(value) ? 0 : 2);
}

export function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes} dk ${seconds.toString().padStart(2, "0")} sn`;
}

export function formatDurationFromSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  if (hours > 0) {
    return `${hours} sa ${minutes} dk`;
  }

  if (minutes > 0) {
    return `${minutes} dk ${seconds.toString().padStart(2, "0")} sn`;
  }

  return `${seconds} sn`;
}

export function formatDelta(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return "Karşılaştırma yok";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, digits)}`;
}

export function formatPeriodMonth(period: string | null | undefined, options?: { includeYear?: boolean }) {
  if (!period) {
    return "-";
  }

  const [year, month] = period.split("-").map(Number);
  if (!year || !month) {
    return period;
  }

  const formatter = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    ...(options?.includeYear ? { year: "numeric" as const } : {})
  });
  const label = formatter.format(new Date(Date.UTC(year, month - 1, 1)));

  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

/**
 * Konuşma süresi hedef etiketini saniyeye çevirir.
 *
 * Desteklenen formatlar:
 *  - "35'"           → 35 saat    → 126.000 sn
 *  - "35"            → 35 saat    → 126.000 sn
 *  - "35 saat"       → 35 saat    → 126.000 sn
 *  - "35,5"          → 35,5 saat  → 127.800 sn
 *  - "35:00:00"      → 35 sa 00 dk 00 sn
 *  - "35:30"         → 35 saat 30 dk
 *
 * Semantik: kullanıcı "35'" yazdığında (aptostropha rağmen) aylık toplam
 * konuşma süresi hedefi olarak **35 saat** olarak yorumlanır.
 */
export function parseTalkDurationLabelToSeconds(label: string | null | undefined): number {
  if (!label) return 0;
  const trimmed = label.trim();
  if (!trimmed) return 0;

  // HH:MM veya HH:MM:SS formatı
  const hmsMatch = trimmed.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (hmsMatch) {
    const h = Number.parseInt(hmsMatch[1] ?? "0", 10);
    const m = Number.parseInt(hmsMatch[2] ?? "0", 10);
    const s = Number.parseInt(hmsMatch[3] ?? "0", 10);
    return h * 3600 + m * 60 + s;
  }

  // İlk sayıyı çıkar, saat olarak yorumla ("35'", "35 saat", "35", "35,5")
  const numMatch = trimmed.match(/(\d+(?:[.,]\d+)?)/);
  if (!numMatch || !numMatch[1]) return 0;
  const value = Number.parseFloat(numMatch[1].replace(",", "."));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 3600);
}

export function getPreviousPeriod(period: string | null | undefined) {
  if (!period) {
    return null;
  }

  const [year, month] = period.split("-").map(Number);
  if (!year || !month) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatDateLong(iso: string | null | undefined) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const fmt = new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" });
  const label = fmt.format(date).replace(".", "");
  return label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1);
}

export function formatDuration(startIso: string | null | undefined, endIso?: string | null | undefined) {
  if (!startIso) return "";
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0 && remMonths === 0) return "< 1 ay";
  if (years === 0) return `${remMonths} ay`;
  if (remMonths === 0) return `${years} yıl`;
  return `${years} yıl ${remMonths} ay`;
}
