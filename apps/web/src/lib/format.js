export function formatNumber(value, digits = 0) {
    if (value === null || value === undefined) {
        return "-";
    }
    return new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(value);
}
export function formatPercent(value, digits = 2) {
    if (value === null || value === undefined) {
        return "-";
    }
    return `${formatNumber(value, digits)}%`;
}
export function formatSeconds(value) {
    if (value === null || value === undefined) {
        return "-";
    }
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${minutes} dk ${seconds.toString().padStart(2, "0")} sn`;
}
export function formatDelta(value, digits = 2) {
    if (value === null || value === undefined) {
        return "Karsilastirma yok";
    }
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${formatNumber(value, digits)}`;
}
