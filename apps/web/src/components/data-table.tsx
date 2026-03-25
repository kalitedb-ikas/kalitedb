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
  stickyHeader?: boolean;
  density?: "comfortable" | "compact";
  emptyState?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const theme = props.theme ?? "light";
  const density = props.density ?? "comfortable";
  const stickyHeader = props.stickyHeader ?? true;
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
          ? "overflow-hidden rounded-[28px] border border-white/12 bg-slate-950/72 shadow-[0_28px_70px_rgba(2,6,23,0.32)] backdrop-blur-2xl"
          : "surface-default overflow-hidden rounded-[26px]"
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead
            className={
              theme === "dark"
                ? `${stickyHeader ? "sticky top-0 z-[1]" : ""} border-b border-white/10 bg-slate-950/95`
                : `${stickyHeader ? "sticky top-0 z-[1]" : ""} border-b border-slate-200 bg-white/95 backdrop-blur`
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
                        : `${headerPadding} text-xs font-semibold uppercase tracking-wider text-slate-500`
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        className={
                          theme === "dark"
                            ? "inline-flex items-center gap-1.5 transition-colors hover:text-white"
                            : "inline-flex items-center gap-1.5 transition-colors hover:text-slate-800"
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
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    theme === "dark"
                      ? "border-b border-white/8 transition-colors hover:bg-white/[0.04]"
                      : "border-b border-slate-200/70 transition-colors hover:bg-slate-50/80"
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={
                        theme === "dark"
                          ? `${cellPadding} align-top text-white/92`
                          : `${cellPadding} align-top text-slate-800`
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
                      : "px-4 py-10 text-center text-sm text-slate-500"
                  }
                  colSpan={table.getAllLeafColumns().length || 1}
                >
                  {props.emptyState ?? "Gösterilecek kayıt bulunamadı."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
