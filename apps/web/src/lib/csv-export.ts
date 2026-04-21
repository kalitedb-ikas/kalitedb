type CsvCell = string | number | null | undefined;

function formatCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return value.toLocaleString("tr-TR", { maximumFractionDigits: 10, useGrouping: false });
  }
  return String(value);
}

function escapeCsvCell(value: CsvCell): string {
  const str = formatCell(value);
  if (/[",;\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(
  filename: string,
  headers: string[],
  rows: CsvCell[][],
  separator: string = ";"
): void {
  const lines = [
    headers.map(escapeCsvCell).join(separator),
    ...rows.map((row) => row.map(escapeCsvCell).join(separator))
  ];
  const content = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
