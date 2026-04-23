import { PageHeader, StatCard, SurfaceCard } from "@kalitedb/ui";
import { selectDefaultReportPeriod } from "@kalitedb/shared";
import type { SalesMeeting } from "@kalitedb/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DataTable } from "../components/data-table";
import { LossReasonSelect } from "../components/loss-reason-select";
import { PeriodSelect } from "../components/period-select";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPeriodMonth } from "../lib/format";

type MeetingRow = {
  id: string;
  date: string;
  qualityMember: string;
  salesRepresentative: string;
  customerName: string;
  status: string;
  licenseDetail: string;
  licenseAmount: number | null;
  lossReason: string;
  lossNote: string;
};

type MonthlySummary = {
  meetingCount: number;
  totalLicenseCount: number;
  conversionRate: number;
  totalSales: number;
  licenseBreakdown: Record<string, number>;
};

const STATUS_LABELS: Record<string, { label: string; tone: "green" | "red" | "yellow" }> = {
  kapandi: { label: "Kapandı", tone: "green" },
  kaybedildi: { label: "Kaybedildi", tone: "red" },
  devam_ediyor: { label: "Devam Ediyor", tone: "yellow" }
};

function normalizeStatus(raw: string | undefined): string {
  if (!raw) return "";
  const lower = raw.toLocaleLowerCase("tr-TR").trim();
  if (lower === "kapandı" || lower === "kapandi") return "kapandi";
  if (lower === "kaybedildi") return "kaybedildi";
  if (lower.includes("devam")) return "devam_ediyor";
  return "";
}

const STATUS_COLORS = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-400",
  red: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400",
  yellow: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400"
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status];
  if (!config) return <span className="text-sm text-slate-400">—</span>;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[config.tone]}`}>
      {config.label}
    </span>
  );
}

function InlineStatusSelect(props: { status: string; onChange: (next: string) => void; disabled?: boolean | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  };

  const current = STATUS_LABELS[props.status];
  const options = Object.entries(STATUS_LABELS);

  return (
    <div ref={ref}>
      <button
        ref={btnRef}
        className={[
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
          current
            ? `${STATUS_COLORS[current.tone]} hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 dark:hover:ring-slate-500`
            : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500"
        ].join(" ")}
        disabled={props.disabled}
        onClick={handleOpen}
        type="button"
      >
        {current?.label ?? "Seçiniz"}
        <svg className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open ? (
        <div
          className="fixed z-50 min-w-[140px] rounded-[10px] border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
          style={{ top: pos.top, left: pos.left }}
        >
          {options.map(([key, cfg]) => (
            <button
              key={key}
              className={[
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition hover:bg-slate-50 dark:hover:bg-slate-700",
                key === props.status ? "bg-slate-50 dark:bg-slate-700" : ""
              ].join(" ")}
              onClick={() => { props.onChange(key); setOpen(false); }}
              type="button"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${cfg.tone === "green" ? "bg-emerald-500" : cfg.tone === "red" ? "bg-rose-500" : "bg-amber-500"}`} />
              <span className="text-slate-700 dark:text-slate-200">{cfg.label}</span>
              {key === props.status ? <Check className="ml-auto h-3 w-3 text-slate-400" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function computeSummary(meetings: MeetingRow[]): MonthlySummary {
  // Tüm geçerli toplantılar (müşteri adı olanlar — gözlem dahil)
  const allMeetings = meetings.filter((m) => m.customerName.trim());
  // Dönüşüm hesabı için sadece durumu olanlar (gözlem hariç)
  const statusMeetings = allMeetings.filter((m) => m.status);
  const closedMeetings = statusMeetings.filter((m) => m.status === "kapandi");
  const totalSales = closedMeetings.reduce((sum, m) => sum + (m.licenseAmount ?? 0), 0);

  // Lisans kırılımı — her kapanış = 1 lisans, lisans detayı olmayanlar sayılmaz
  const licenseBreakdown: Record<string, number> = {};
  let totalLicenseCount = 0;
  for (const m of closedMeetings) {
    if (!m.licenseDetail) continue;
    const detail = m.licenseDetail.trim();
    const baseType = extractLicenseBaseType(detail);
    licenseBreakdown[baseType] = (licenseBreakdown[baseType] ?? 0) + 1;
    totalLicenseCount += 1;
  }

  return {
    meetingCount: allMeetings.length,
    totalLicenseCount,
    conversionRate: statusMeetings.length > 0 ? (closedMeetings.length / statusMeetings.length) * 100 : 0,
    totalSales,
    licenseBreakdown
  };
}

function extractLicenseBaseType(detail: string): string {
  const lower = detail.toLocaleLowerCase("tr-TR");
  if (lower.includes("premium")) return "Premium";
  if (lower.includes("scale plus")) return "Scale Plus";
  if (lower.includes("scale")) return "Scale";
  return detail;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(value);
}

function InlineLossReasonEdit(props: {
  reason: string;
  note: string;
  existingReasons: string[];
  onSave: (data: { reason: string; note: string }) => void;
  disabled?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(props.reason);
  const [note, setNote] = useState(props.note);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setReason(props.reason);
      setNote(props.note);
    }
  }, [open, props.reason, props.note]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      // LossReasonSelect kendi portal panelini açar; o panelin içi body altında
      const el = target as HTMLElement;
      if (el.closest?.("[data-loss-reason-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const POPOVER_WIDTH = 320;
      const POPOVER_EST_HEIGHT = 260;
      const MARGIN = 12;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - MARGIN;
      const left = Math.max(MARGIN, Math.min(rect.left, maxLeft));
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < POPOVER_EST_HEIGHT + MARGIN && rect.top > POPOVER_EST_HEIGHT + MARGIN
          ? rect.top - POPOVER_EST_HEIGHT - 4
          : rect.bottom + 4;
      setPos({ top, left });
    }
    setOpen((o) => !o);
  };

  const handleSave = () => {
    props.onSave({ reason: reason.trim(), note: note.trim() });
    setOpen(false);
  };

  const hasReason = props.reason.trim().length > 0;

  return (
    <>
      <button
        ref={btnRef}
        className={[
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
          hasReason
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:ring-2 hover:ring-rose-200 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400"
            : "border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500"
        ].join(" ")}
        disabled={props.disabled}
        onClick={handleOpen}
        title={props.note || undefined}
        type="button"
      >
        {hasReason ? props.reason : "+ Sebep ekle"}
      </button>

      {open
        ? createPortal(
            <div
              ref={popRef}
              className="fixed z-50 w-[320px] rounded-[10px] border border-slate-200 bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.18)] dark:border-slate-600 dark:bg-slate-800"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Kayıp Sebebi</label>
                <LossReasonSelect
                  value={reason}
                  onChange={setReason}
                  existingReasons={props.existingReasons}
                />
                <label className="block pt-1 text-xs font-medium text-slate-600 dark:text-slate-400">Not</label>
                <textarea
                  className="min-h-[52px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100"
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Opsiyonel detay"
                  value={note}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    className="h-8 rounded-[8px] border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    Vazgeç
                  </button>
                  <button
                    className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                    onClick={handleSave}
                    type="button"
                  >
                    <Check size={12} />
                    Kaydet
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const columnHelper = createColumnHelper<MeetingRow>();

function buildColumns(
  onStatusChange?: (rowId: string, status: string) => void,
  statusUpdating?: boolean,
  onLossSave?: (rowId: string, data: { reason: string; note: string }) => void,
  lossExistingReasons?: string[],
  lossUpdating?: boolean
) {
  return [
    columnHelper.accessor("qualityMember", {
      header: "QT Üyesi",
      cell: (info) => info.getValue(),
      size: 140
    }),
    columnHelper.accessor("salesRepresentative", {
      header: "Süreç Danışmanı",
      cell: (info) => info.getValue(),
      size: 160
    }),
    columnHelper.accessor("customerName", {
      header: "HS Kaydı",
      cell: (info) => (
        <span className="font-medium text-slate-900 dark:text-slate-100">{info.getValue()}</span>
      ),
      size: 180
    }),
    columnHelper.accessor("status", {
      header: "Süreç Takibi",
      cell: (info) =>
        onStatusChange ? (
          <InlineStatusSelect
            disabled={statusUpdating}
            status={info.getValue()}
            onChange={(next) => onStatusChange(info.row.original.id, next)}
          />
        ) : (
          <StatusBadge status={info.getValue()} />
        ),
      size: 130
    }),
    columnHelper.accessor("licenseDetail", {
      header: "Lisan Detayı",
      cell: (info) => info.getValue() || "—",
      size: 160
    }),
    columnHelper.accessor("licenseAmount", {
      header: "Lisans Tutarı",
      cell: (info) => {
        const val = info.getValue();
        return val != null && val > 0 ? formatCurrency(val) : "—";
      },
      size: 140
    }),
    columnHelper.accessor("lossReason", {
      header: "Kayıp Sebebi",
      cell: (info) => {
        const status = info.row.original.status;
        if (status !== "kaybedildi") return <span className="text-slate-300">—</span>;
        if (onLossSave) {
          return (
            <InlineLossReasonEdit
              reason={info.getValue()}
              note={info.row.original.lossNote}
              existingReasons={lossExistingReasons ?? []}
              disabled={lossUpdating}
              onSave={(data) => onLossSave(info.row.original.id, data)}
            />
          );
        }
        const reason = info.getValue();
        if (!reason) return <span className="text-xs text-slate-400">Belirtilmemiş</span>;
        const note = info.row.original.lossNote;
        return (
          <span
            className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-400"
            title={note || undefined}
          >
            {reason}
          </span>
        );
      },
      size: 180
    })
  ] as unknown as import("@tanstack/react-table").ColumnDef<MeetingRow, unknown>[];
}

function toRows(meetings: SalesMeeting[]): MeetingRow[] {
  return meetings.map((m) => ({
    id: m.id,
    date: m.date ?? "",
    qualityMember: m.qualityMember,
    salesRepresentative: m.salesRepresentative,
    customerName: m.customerName,
    status: normalizeStatus(m.status),
    licenseDetail: m.licenseDetail ?? "",
    licenseAmount: m.licenseAmount ?? null,
    lossReason: m.lossReason ?? "",
    lossNote: m.lossNote ?? ""
  }));
}

type MeetingFormData = {
  date: string;
  qualityMember: string;
  salesRepresentative: string;
  customerName: string;
  status: string;
  licenseDetail: string;
  licenseAmount: string;
  lossReason: string;
  lossNote: string;
};

const emptyMeetingForm: MeetingFormData = {
  date: "",
  qualityMember: "",
  salesRepresentative: "",
  customerName: "",
  status: "",
  licenseDetail: "",
  licenseAmount: "",
  lossReason: "",
  lossNote: ""
};

function MeetingFormModal(props: {
  open: boolean;
  saving: boolean;
  existingReasons: string[];
  onClose: () => void;
  onSave: (data: MeetingFormData) => void;
}) {
  const [form, setForm] = useState<MeetingFormData>(emptyMeetingForm);

  if (!props.open) return null;

  const canSave = form.customerName.trim().length > 0 && !props.saving;

  const update = (field: keyof MeetingFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        aria-label="Kapat"
        className="absolute inset-0 bg-slate-950/28 backdrop-blur-sm"
        onClick={props.onClose}
        type="button"
      />
      <div
        className="relative z-10 mx-4 w-full max-w-lg rounded-[10px] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-950 dark:text-slate-100">
            Toplantı Ekle
          </h3>
          <button
            className="inline-flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            onClick={props.onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Tarih alanı gizli — CSV'den gelen tarih verisi korunuyor */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Süreç Takibi</label>
              <select
                className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                onChange={(e) => update("status", e.target.value)}
                value={form.status}
              >
                <option value="">Seçiniz</option>
                <option value="devam_ediyor">Devam Ediyor</option>
                <option value="kapandi">Kapandı</option>
                <option value="kaybedildi">Kaybedildi</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">QT Üyesi</label>
            <input
              className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              onChange={(e) => update("qualityMember", e.target.value)}
              placeholder="Kalite ekip üyesi adı"
              type="text"
              value={form.qualityMember}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Süreç Danışmanı</label>
            <input
              className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              onChange={(e) => update("salesRepresentative", e.target.value)}
              placeholder="Satış temsilcisi adı"
              type="text"
              value={form.salesRepresentative}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">HS Kaydı (Müşteri) *</label>
            <input
              className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              onChange={(e) => update("customerName", e.target.value)}
              placeholder="Müşteri adı veya firma"
              type="text"
              value={form.customerName}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Lisan Detayı</label>
              <input
                className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                onChange={(e) => update("licenseDetail", e.target.value)}
                placeholder="Ör: Scale Plus 2+1"
                type="text"
                value={form.licenseDetail}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Lisans Tutarı (TRY)</label>
              <input
                className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                min={0}
                onChange={(e) => update("licenseAmount", e.target.value)}
                placeholder="0"
                step={0.01}
                type="number"
                value={form.licenseAmount}
              />
            </div>
          </div>

          {form.status === "kaybedildi" ? (
            <div className="space-y-3 rounded-[10px] border border-rose-200/70 bg-rose-50/40 p-3 dark:border-rose-700/30 dark:bg-rose-950/20">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Kayıp Sebebi</label>
                <LossReasonSelect
                  value={form.lossReason}
                  onChange={(v) => update("lossReason", v)}
                  existingReasons={props.existingReasons}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Kayıp Notu</label>
                <textarea
                  className="min-h-[60px] w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  onChange={(e) => update("lossNote", e.target.value)}
                  placeholder="Opsiyonel detay"
                  value={form.lossNote}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className="inline-flex min-h-10 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            onClick={props.onClose}
            type="button"
          >
            Vazgeç
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-slate-900 bg-slate-950 px-4 text-sm font-medium text-white shadow transition hover:bg-slate-800 disabled:opacity-50 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={!canSave}
            onClick={() => {
              props.onSave(form);
              setForm(emptyMeetingForm);
            }}
            type="button"
          >
            <Check size={14} />
            {props.saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SalesMeetingsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });

  const salesPeriods = useMemo(
    () =>
      [...(periodsQuery.data ?? [])]
        .filter((p) => (p.department ?? "cs") === "sales")
        .sort((a, b) => a.month.localeCompare(b.month)),
    [periodsQuery.data]
  );

  const defaultPeriod = useMemo(() => {
    const now = new Date();
    const prevMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
    return salesPeriods.find((p) => p.month === prevMonth) ?? selectDefaultReportPeriod(salesPeriods);
  }, [salesPeriods]);
  const periodId = searchParams.get("periodId") ?? defaultPeriod?.id;
  const selectedPeriod = salesPeriods.find((p) => p.id === periodId);

  const meetingsQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["sales-meetings", auth.token, periodId],
    queryFn: () => api.getSalesMeetings(auth.token, periodId!),
    staleTime: 5 * 60 * 1000
  });

  const [isModalOpen, setIsModalOpen] = useState(false);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ meetingId, status }: { meetingId: string; status: string }) => {
      if (!periodId) throw new Error("Dönem seçili değil.");
      const existing = meetingsQuery.data ?? [];
      const all = existing.map((m) => {
        const isTarget = m.id === meetingId;
        const newStatus = isTarget
          ? (status as "devam_ediyor" | "kapandi" | "kaybedildi")
          : m.status;
        const stillLost = newStatus === "kaybedildi";
        return {
          periodId: m.periodId,
          qualityMember: m.qualityMember,
          salesRepresentative: m.salesRepresentative,
          customerName: m.customerName,
          licenseAmount: m.licenseAmount ?? null,
          ...(m.date ? { date: m.date } : {}),
          ...(newStatus ? { status: newStatus } : {}),
          ...(m.licenseDetail ? { licenseDetail: m.licenseDetail } : {}),
          ...(stillLost && m.lossReason ? { lossReason: m.lossReason } : {}),
          ...(stillLost && m.lossNote ? { lossNote: m.lossNote } : {})
        };
      });
      await api.saveSalesMeetings(auth.token, periodId, all);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-meetings", auth.token, periodId] });
    }
  });

  const updateLossDataMutation = useMutation({
    mutationFn: async ({ meetingId, reason, note }: { meetingId: string; reason: string; note: string }) => {
      if (!periodId) throw new Error("Dönem seçili değil.");
      await api.updateSalesMeeting(auth.token, periodId, meetingId, {
        lossReason: reason || undefined,
        lossNote: note || undefined
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-meetings", auth.token, periodId] });
    }
  });

  const addMeetingMutation = useMutation({
    mutationFn: async (data: MeetingFormData) => {
      if (!periodId) throw new Error("Dönem seçili değil.");
      const existing = meetingsQuery.data ?? [];
      const isLost = data.status === "kaybedildi";
      const newMeeting = {
        periodId,
        qualityMember: data.qualityMember.trim(),
        salesRepresentative: data.salesRepresentative.trim(),
        customerName: data.customerName.trim(),
        licenseAmount: data.licenseAmount ? Number(data.licenseAmount) : null,
        ...(data.date ? { date: data.date } : {}),
        ...(data.status ? { status: data.status as "devam_ediyor" | "kapandi" | "kaybedildi" } : {}),
        ...(data.licenseDetail.trim() ? { licenseDetail: data.licenseDetail.trim() } : {}),
        ...(isLost && data.lossReason.trim() ? { lossReason: data.lossReason.trim() } : {}),
        ...(isLost && data.lossNote.trim() ? { lossNote: data.lossNote.trim() } : {})
      };
      const all = [...existing.map((m) => ({
        periodId: m.periodId,
        qualityMember: m.qualityMember,
        salesRepresentative: m.salesRepresentative,
        customerName: m.customerName,
        licenseAmount: m.licenseAmount ?? null,
        ...(m.date ? { date: m.date } : {}),
        ...(m.status ? { status: m.status } : {}),
        ...(m.licenseDetail ? { licenseDetail: m.licenseDetail } : {}),
        ...(m.status === "kaybedildi" && m.lossReason ? { lossReason: m.lossReason } : {}),
        ...(m.status === "kaybedildi" && m.lossNote ? { lossNote: m.lossNote } : {})
      })), newMeeting];
      await api.saveSalesMeetings(auth.token, periodId, all);
    },
    onSuccess: () => {
      setIsModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["sales-meetings", auth.token, periodId] });
    }
  });

  const rows = useMemo(() => toRows(meetingsQuery.data ?? []), [meetingsQuery.data]);
  const summary = useMemo(() => computeSummary(rows), [rows]);

  const existingReasons = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.lossReason.trim()) set.add(r.lossReason.trim());
    }
    return Array.from(set);
  }, [rows]);

  const lossReasonBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.status !== "kaybedildi") continue;
      const key = r.lossReason.trim() || "Belirtilmemiş";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [rows]);

  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const filteredRows = useMemo(() => {
    if (reasonFilter === "all") return rows;
    if (reasonFilter === "__unspecified__") {
      return rows.filter((r) => r.status === "kaybedildi" && !r.lossReason.trim());
    }
    return rows.filter((r) => r.status === "kaybedildi" && r.lossReason.trim() === reasonFilter);
  }, [rows, reasonFilter]);

  const columns = useMemo(
    () => buildColumns(
      (rowId, status) => updateStatusMutation.mutate({ meetingId: rowId, status }),
      updateStatusMutation.isPending,
      (rowId, data) => updateLossDataMutation.mutate({ meetingId: rowId, reason: data.reason, note: data.note }),
      existingReasons,
      updateLossDataMutation.isPending
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateStatusMutation.isPending, updateLossDataMutation.isPending, existingReasons]
  );

  const periodLabel = selectedPeriod ? formatPeriodMonth(selectedPeriod.month) : "";
  const licenseDetails = Object.entries(summary.licenseBreakdown)
    .sort(([a], [b]) => a.localeCompare(b, "tr"))
    .map(([type, count]) => `${count} adet ${type}`)
    .join("\n");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Satış"
        title="Satış Toplantıları"
        subtitle="Kalite ekibinin satış temsilcileri ile katıldığı toplantılar ve dönüşüm metrikleri."
        actions={<PeriodSelect />}
      />

      {/* Aylık Özet */}
      <SurfaceCard title={`${periodLabel} Özet`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Toplantı Adet"
            value={String(summary.meetingCount)}
          />
          <StatCard
            label="Toplam Lisans"
            value={String(summary.totalLicenseCount)}
          />
          <StatCard
            label="Dönüşüm Oranı"
            value={`${summary.conversionRate.toFixed(2).replace(".", ",")}%`}
            tone={summary.conversionRate >= 30 ? "green" : summary.conversionRate >= 15 ? "yellow" : "neutral"}
          />
          <StatCard
            label="Toplam Satış"
            value={formatCurrency(summary.totalSales)}
          />
          <div className="rounded-[10px] border border-slate-200/80 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Lisans Detayları</p>
            {licenseDetails ? (
              <pre className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                {licenseDetails}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-slate-400">—</p>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Kayıp Sebepleri Dağılımı */}
      {lossReasonBreakdown.length > 0 ? (
        <SurfaceCard title={`Kayıp Sebepleri — ${periodLabel}`}>
          <div className="h-64">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={lossReasonBreakdown} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="currentColor" strokeOpacity={0.08} />
                <XAxis type="number" allowDecimals={false} stroke="currentColor" strokeOpacity={0.4} fontSize={11} />
                <YAxis type="category" dataKey="reason" width={160} stroke="currentColor" strokeOpacity={0.6} fontSize={12} />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
                  contentStyle={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.3)", fontSize: 12 }}
                  formatter={(value) => [`${value} toplantı`, ""]}
                />
                <Bar dataKey="count" fill="#f43f5e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SurfaceCard>
      ) : null}

      {/* Tablo */}
      <SurfaceCard
        title="Toplantılar"
        actions={
          <div className="flex items-center gap-2">
            {existingReasons.length > 0 || lossReasonBreakdown.length > 0 ? (
              <select
                className="h-9 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:border-slate-300 focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                onChange={(e) => setReasonFilter(e.target.value)}
                value={reasonFilter}
              >
                <option value="all">Tüm sebepler</option>
                {existingReasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__unspecified__">Belirtilmemiş</option>
              </select>
            ) : null}
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-900 bg-slate-950 px-4 text-sm font-medium text-white shadow transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              disabled={!periodId}
              onClick={() => setIsModalOpen(true)}
              type="button"
            >
              <Plus size={14} />
              Toplantı Ekle
            </button>
          </div>
        }
      >
        {meetingsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-slate-400">Yükleniyor...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-slate-400">
              {rows.length === 0 ? "Bu dönem için toplantı verisi bulunmuyor." : "Seçili filtreye uygun toplantı yok."}
            </p>
          </div>
        ) : (
          <DataTable columns={columns} data={filteredRows} />
        )}
      </SurfaceCard>

      <MeetingFormModal
        existingReasons={existingReasons}
        open={isModalOpen}
        saving={addMeetingMutation.isPending}
        onClose={() => setIsModalOpen(false)}
        onSave={(data) => addMeetingMutation.mutate(data)}
      />
    </div>
  );
}
