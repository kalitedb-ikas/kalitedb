import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { useState } from "react";
export function DataTable(props) {
    const [sorting, setSorting] = useState([]);
    const table = useReactTable({
        data: props.data,
        columns: props.columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel()
    });
    return (_jsx("div", { className: "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full text-left text-sm", children: [_jsx("thead", { className: "bg-slate-950 text-white", children: table.getHeaderGroups().map((headerGroup) => (_jsx("tr", { children: headerGroup.headers.map((header) => (_jsx("th", { className: "px-4 py-3 font-semibold", children: header.isPlaceholder ? null : (_jsx("button", { className: "inline-flex items-center gap-2", onClick: header.column.getToggleSortingHandler(), type: "button", children: flexRender(header.column.columnDef.header, header.getContext()) })) }, header.id))) }, headerGroup.id))) }), _jsx("tbody", { children: table.getRowModel().rows.map((row) => (_jsx("tr", { className: "border-b border-slate-100 hover:bg-slate-50", children: row.getVisibleCells().map((cell) => (_jsx("td", { className: "px-4 py-3 align-top text-slate-700", children: flexRender(cell.column.columnDef.cell, cell.getContext()) }, cell.id))) }, row.id))) })] }) }) }));
}
