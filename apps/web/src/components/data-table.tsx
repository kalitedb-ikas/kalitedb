import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState
} from "@tanstack/react-table";
import { type ReactNode, useState } from "react";

export function DataTable<TData>(props: {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  theme?: "light" | "dark";
  variant?: "default" | "emerald";
  stickyHeader?: boolean;
  density?: "comfortable" | "compact";
  emptyState?: ReactNode;
  striped?: boolean;
  summaryRows?: Array<Record<string, ReactNode> & { _label?: string; _tone?: "emerald" }>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const theme = props.theme ?? "light";
  const variant = props.variant ?? "default";
  const density = props.density ?? "comfortable";
  const stickyHeader = props.stickyHeader ?? true;
  const striped = props.striped ?? false;
  const cellPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-3.5";
  const headerPadding = density === "compact" ? "px-4 py-2.5" : "px-4 py-3";

  const table = useReactTable({
    data: props.data,
    columns: props.columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return (
    <div
      className={
        theme === "dark"
          ? "overflow-hidden rounded-[10px] border border-white/12 bg-slate-950/72 shadow-[0_28px_70px_rgba(2,6,23,0.32)] backdrop-blur-2xl"
          : "surface-default overflow-hidden rounded-[10px] dark:text-slate-200"
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead
            className={
              theme === "dark"
                ? `${stickyHeader ? "sticky top-0 z-[1]" : ""} border-b border-white/10 bg-slate-950/95`
                : variant === "emerald"
                  ? `${stickyHeader ? "sticky top-0 z-[1]" : ""} bg-emerald-800 dark:bg-emerald-900`
                  : `${stickyHeader ? "sticky top-0 z-[1]" : ""} border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-600 dark:bg-slate-800/95`
            }
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={
                      theme === "dark"
                        ? `${headerPadding} text-xs font-semibold uppercase tracking-wider text-white/68`
                        : variant === "emerald"
                          ? `${headerPadding} text-xs font-bold uppercase tracking-wider text-white whitespace-nowrap`
                          : `${headerPadding} text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400`
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        className={
                          theme === "dark"
                            ? "inline-flex items-center gap-1.5 transition-colors hover:text-white"
                            : variant === "emerald"
                              ? "inline-flex items-center gap-1.5 transition-colors hover:text-emerald-200"
                              : "inline-flex items-center gap-1.5 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
                        }
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className={
                    theme === "dark"
                      ? "border-b border-white/8 transition-colors hover:bg-white/[0.04]"
                      : `border-b border-slate-200/70 transition-colors hover:bg-slate-50/80 dark:border-slate-700/50 dark:hover:bg-slate-700/30 ${
                          striped && rowIndex % 2 === 1 ? "bg-slate-50/50 dark:bg-slate-800/50" : ""
                        }`
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={
                        theme === "dark"
                          ? `${cellPadding} align-top text-white/92`
                          : `${cellPadding} align-top text-slate-800 dark:text-slate-200`
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  className={
                    theme === "dark"
                      ? "px-4 py-10 text-center text-sm text-white/68"
                      : "px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  }
                  colSpan={table.getAllLeafColumns().length || 1}
                >
                  {props.emptyState ?? "Gösterilecek kayıt bulunamadı."}
                </td>
              </tr>
            )}
            {props.summaryRows?.map((summaryRow, rowIdx) => {
              const leafColumns = table.getAllLeafColumns();
              const tone = summaryRow._tone ?? "emerald";
              const rowClass =
                tone === "emerald"
                  ? "border-t-2 border-emerald-600 bg-emerald-800 dark:border-emerald-700 dark:bg-emerald-900"
                  : "border-t border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-700";
              const cellTextClass = tone === "emerald" ? "text-emerald-200" : "text-slate-800 dark:text-slate-200";
              const labelTextClass = tone === "emerald" ? "text-white" : "text-slate-900 dark:text-slate-100";
              return (
                <tr key={`summary-${rowIdx}`} className={rowClass}>
                  {leafColumns.map((column, colIdx) => {
                    const value = summaryRow[column.id];
                    const isFirst = colIdx === 0;
                    return (
                      <td
                        key={column.id}
                        className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${
                          isFirst ? labelTextClass : `${cellTextClass} text-center`
                        }`}
                      >
                        {isFirst ? (value ?? summaryRow._label ?? "") : (value ?? "")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
