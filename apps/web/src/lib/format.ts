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

export function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
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
