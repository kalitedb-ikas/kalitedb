import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import type { TrainingEvent } from "@kalitedb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../lib/auth";
import { api, type AuthenticatedUser } from "../lib/api";

// ─── Constants ────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];
const WEEKDAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum"];

const EVENT_COLORS = [
  { value: "#3b82f6", label: "Mavi" },
  { value: "#22c55e", label: "Yeşil" },
  { value: "#f97316", label: "Turuncu" },
  { value: "#a855f7", label: "Mor" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#ec4899", label: "Pembe" },
  { value: "#eab308", label: "Sarı" },
  { value: "#64748b", label: "Gri" }
];

type ViewMode = "month" | "week" | "3day" | "day";

const VIEW_MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: "day", label: "Gün" },
  { value: "3day", label: "3 Gün" },
  { value: "week", label: "Hafta" },
  { value: "month", label: "Ay" }
];

// ─── Date helpers ─────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthTitle(date: Date) {
  const formatter = new Intl.DateTimeFormat("tr-TR", { month: "long" });
  const monthName = formatter.format(date);
  return `${monthName.charAt(0).toLocaleUpperCase("tr-TR")}${monthName.slice(1)} ${date.getFullYear()}`;
}

function formatDayTitle(date: Date) {
  const formatter = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const result = formatter.format(date);
  return result.charAt(0).toLocaleUpperCase("tr-TR") + result.slice(1);
}

function formatWeekTitle(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    const monthFormatter = new Intl.DateTimeFormat("tr-TR", { month: "long" });
    const monthName = monthFormatter.format(start);
    return `${start.getDate()} – ${end.getDate()} ${monthName.charAt(0).toLocaleUpperCase("tr-TR")}${monthName.slice(1)} ${start.getFullYear()}`;
  }
  const sf = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });
  const ef = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  return `${sf.format(start)} – ${ef.format(end)}`;
}


function isToday(dateStr: string) {
  return dateStr === toDateStr(new Date());
}

/** Monday of the week containing `date` */
function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Month grid builder ──────────────────────────────────────────────

type CalendarDay = { date: string; day: number; isCurrentMonth: boolean };

function getMonthCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: CalendarDay[] = [];

  if (startDow > 0) {
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevLastDay - i;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      days.push({ date: `${py}-${String(pm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, isCurrentMonth: false });
    }
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, isCurrentMonth: true });
  }

  const remainder = days.length % 7;
  if (remainder > 0 && remainder <= 5) {
    const needed = 7 - remainder;
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    for (let d = 1; d <= needed; d++) {
      days.push({ date: `${ny}-${String(nm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, isCurrentMonth: false });
    }
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 5));
  }
  return weeks;
}

// ─── Query month range for view mode ─────────────────────────────────

function getQueryMonths(anchorDate: Date, viewMode: ViewMode): string[] {
  const months = new Set<string>();
  months.add(getMonthString(anchorDate));

  if (viewMode === "month") {
    // Month view might show days from prev/next month
    const prev = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1);
    const next = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
    months.add(getMonthString(prev));
    months.add(getMonthString(next));
  } else if (viewMode === "week") {
    const monday = getMonday(anchorDate);
    const friday = addDays(monday, 4);
    months.add(getMonthString(monday));
    months.add(getMonthString(friday));
  } else if (viewMode === "3day") {
    const end = addDays(anchorDate, 2);
    months.add(getMonthString(end));
  }

  return Array.from(months);
}

// ─── Form types ──────────────────────────────────────────────────────

type EventFormData = {
  title: string;
  date: string;
  time: string;
  color: string;
  participants: string;
  trainer: string;
};

const emptyForm: EventFormData = {
  title: "",
  date: "",
  time: "",
  color: "#3b82f6",
  participants: "",
  trainer: ""
};

// ─── EventFormModal ──────────────────────────────────────────────────

function EventFormModal(props: {
  open: boolean;
  event?: TrainingEvent;
  defaultDate?: string;
  onClose: () => void;
  onSave: (data: EventFormData) => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<EventFormData>(() => {
    if (props.event) {
      return {
        title: props.event.title,
        date: props.event.date,
        time: props.event.time ?? "",
        color: props.event.color ?? "#3b82f6",
        participants: props.event.participants.join(", "),
        trainer: props.event.trainer ?? ""
      };
    }
    return { ...emptyForm, date: props.defaultDate ?? "" };
  });

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button aria-label="Kapat" className="absolute inset-0 bg-slate-950/28 backdrop-blur-sm" onClick={props.onClose} type="button" />
      <div className="relative z-10 w-full max-w-md rounded-[10px] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            {props.event ? "Etkinlik Düzenle" : "Yeni Etkinlik"}
          </h3>
          <button className="inline-flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200" onClick={props.onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Etkinlik Adı</label>
            <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ör: Onboarding / Rakip Analizi" value={form.title} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Tarih</label>
              <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" value={form.date} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Saat <span className="text-slate-400">(opsiyonel)</span></label>
              <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" onChange={(e) => setForm({ ...form, time: e.target.value })} type="time" value={form.time} />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Renk</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map((c) => (
                <button key={c.value} className={["flex size-8 items-center justify-center rounded-full border-2 transition", form.color === c.value ? "border-slate-900 dark:border-white" : "border-transparent"].join(" ")} onClick={() => setForm({ ...form, color: c.value })} title={c.label} type="button">
                  <span className="size-5 rounded-full" style={{ backgroundColor: c.value }} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Katılımcılar <span className="text-slate-400">(virgülle ayırın)</span></label>
            <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" onChange={(e) => setForm({ ...form, participants: e.target.value })} placeholder="Ör: Burak, Eva, Nimet" value={form.participants} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Eğitmen</label>
            <input className="h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" onChange={(e) => setForm({ ...form, trainer: e.target.value })} placeholder="Ör: MN" value={form.trainer} />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          {props.event && props.onDelete ? (
            <button className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50" onClick={props.onDelete} type="button">
              <Trash2 size={14} /> Sil
            </button>
          ) : null}
          <div className="flex-1" />
          <button className="inline-flex min-h-10 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" onClick={props.onClose} type="button">Vazgeç</button>
          <button className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-slate-900 bg-slate-950 px-4 text-sm font-medium text-white shadow transition hover:bg-slate-800 disabled:opacity-50 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200" disabled={!form.title.trim() || !form.date || props.saving} onClick={() => props.onSave(form)} type="button">
            <Check size={14} /> {props.saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Event card (used in day/3day/week views) ────────────────────────

function EventCard(props: { event: TrainingEvent; canEdit: boolean; onEdit: () => void }) {
  const { event } = props;
  return (
    <button
      className="group/event flex w-full items-start gap-2 rounded-[10px] px-3 py-2.5 text-left text-sm transition hover:brightness-110"
      onClick={() => props.canEdit && props.onEdit()}
      style={{ backgroundColor: event.color }}
      type="button"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {event.time ? <span className="shrink-0 text-xs font-semibold text-white/70">{event.time}</span> : null}
          <span className="truncate font-medium text-white">{event.title}</span>
        </div>
        {event.participants.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-white/75">{event.participants.join(", ")}</p>
        ) : null}
        {event.trainer ? (
          <p className="mt-0.5 text-xs text-white/60">Eğitmen: {event.trainer}</p>
        ) : null}
      </div>
      {props.canEdit ? <Pencil className="mt-1 shrink-0 text-white/40 opacity-0 transition group-hover/event:opacity-100" size={12} /> : null}
    </button>
  );
}

// ─── Compact event pill (used in month view) ─────────────────────────

function EventPill(props: { event: TrainingEvent; canEdit: boolean; onEdit: () => void }) {
  const { event } = props;
  return (
    <button
      className="group/event flex w-full items-start gap-1 rounded-[10px] px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-white transition hover:brightness-110 sm:text-xs"
      onClick={() => props.canEdit && props.onEdit()}
      style={{ backgroundColor: event.color }}
      title={[event.title, event.time ? `Saat: ${event.time}` : null, event.participants.length ? `Katılımcılar: ${event.participants.join(", ")}` : null, event.trainer ? `Eğitmen: ${event.trainer}` : null].filter(Boolean).join("\n")}
      type="button"
    >
      <span className="flex-1 truncate">{event.time ? <><span className="opacity-70">{event.time}</span>{" "}</> : null}{event.title}</span>
      {props.canEdit ? <Pencil className="mt-0.5 shrink-0 text-white/40 opacity-0 transition group-hover/event:opacity-100" size={10} /> : null}
    </button>
  );
}

// ─── View: Month ─────────────────────────────────────────────────────

function MonthView(props: {
  currentDate: Date;
  eventsByDate: Map<string, TrainingEvent[]>;
  canEdit: boolean;
  onCreateEvent: (date: string) => void;
  onEditEvent: (event: TrainingEvent) => void;
}) {
  const weeks = useMemo(
    () => getMonthCalendarDays(props.currentDate.getFullYear(), props.currentDate.getMonth()),
    [props.currentDate]
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-5 gap-px rounded-t-[10px] bg-slate-200 dark:bg-slate-700">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="bg-slate-800 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white first:rounded-tl-[10px] last:rounded-tr-[10px] dark:bg-slate-700">{label}</div>
          ))}
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-700">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-5 gap-px">
              {week.map((day) => {
                const dayEvents = props.eventsByDate.get(day.date) ?? [];
                const today = isToday(day.date);
                return (
                  <div key={day.date} className={["group relative min-h-[120px] bg-white p-2 transition dark:bg-slate-900 sm:min-h-[140px]", !day.isCurrentMonth && "bg-slate-50/60 dark:bg-slate-900/50", today && "ring-2 ring-inset ring-blue-400 dark:ring-blue-500"].filter(Boolean).join(" ")}>
                    <div className="mb-1 flex items-start justify-between">
                      <span className={["inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold", today ? "bg-blue-500 text-white" : day.isCurrentMonth ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-600"].join(" ")}>{day.day}</span>
                      {props.canEdit && day.isCurrentMonth ? (
                        <button className="inline-flex size-6 items-center justify-center rounded-[10px] text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300" onClick={() => props.onCreateEvent(day.date)} title="Etkinlik ekle" type="button"><Plus size={14} /></button>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((event) => (
                        <EventPill key={event.id} canEdit={props.canEdit} event={event} onEdit={() => props.onEditEvent(event)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="h-1 rounded-b-[10px] bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

// ─── View: Column-based (day, 3day, week) ────────────────────────────

function ColumnView(props: {
  days: Date[];
  eventsByDate: Map<string, TrainingEvent[]>;
  canEdit: boolean;
  onCreateEvent: (date: string) => void;
  onEditEvent: (event: TrainingEvent) => void;
}) {
  const cols = props.days.length;

  return (
    <div className="overflow-x-auto">
      <div className={cols === 1 ? "min-w-0" : "min-w-[480px]"}>
        {/* Day headers */}
        <div className={`grid gap-px rounded-t-[10px] bg-slate-200 dark:bg-slate-700`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {props.days.map((d) => {
            const dateStr = toDateStr(d);
            const today = isToday(dateStr);
            const dow = d.getDay();
            const dowLabel = dow >= 1 && dow <= 5 ? (cols <= 3 ? WEEKDAY_LABELS[dow - 1] : WEEKDAY_SHORT[dow - 1]) : ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][dow];
            return (
              <div
                key={dateStr}
                className={[
                  "py-3 text-center first:rounded-tl-[10px] last:rounded-tr-[10px]",
                  today ? "bg-blue-600 text-white" : "bg-slate-800 text-white dark:bg-slate-700"
                ].join(" ")}
              >
                <div className="text-xs font-semibold uppercase tracking-wider">{dowLabel}</div>
                <div className={["mt-0.5 text-lg font-bold", today ? "text-white" : "text-slate-200"].join(" ")}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        <div className="grid gap-px bg-slate-200 dark:bg-slate-700" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {props.days.map((d) => {
            const dateStr = toDateStr(d);
            const dayEvents = props.eventsByDate.get(dateStr) ?? [];
            const today = isToday(dateStr);
            return (
              <div
                key={dateStr}
                className={[
                  "group min-h-[320px] bg-white p-3 dark:bg-slate-900",
                  today && "ring-2 ring-inset ring-blue-400 dark:ring-blue-500"
                ].filter(Boolean).join(" ")}
              >
                {props.canEdit ? (
                  <button
                    className="mb-2 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-[10px] border border-dashed border-slate-200 text-xs font-medium text-slate-400 opacity-0 transition group-hover:opacity-100 hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:text-slate-300"
                    onClick={() => props.onCreateEvent(dateStr)}
                    type="button"
                  >
                    <Plus size={12} /> Ekle
                  </button>
                ) : null}

                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <EventCard key={event.id} canEdit={props.canEdit} event={event} onEdit={() => props.onEditEvent(event)} />
                  ))}
                </div>

                {dayEvents.length === 0 ? (
                  <p className="mt-8 text-center text-xs text-slate-300 dark:text-slate-600">Etkinlik yok</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="h-1 rounded-b-[10px] bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────

export function SalesCalendarPage(props: { currentUser?: AuthenticatedUser | undefined }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const currentUser = props.currentUser;
  const canEdit = Boolean(currentUser && ["admin", "manager", "team_leader", "team"].includes(currentUser.role));

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());

  const [modalState, setModalState] = useState<
    | { type: "closed" }
    | { type: "create"; defaultDate: string }
    | { type: "edit"; event: TrainingEvent }
  >({ type: "closed" });

  // Compute visible days based on view mode
  const visibleDays = useMemo((): Date[] => {
    if (viewMode === "day") return [anchorDate];
    if (viewMode === "3day") return [anchorDate, addDays(anchorDate, 1), addDays(anchorDate, 2)];
    if (viewMode === "week") {
      const monday = getMonday(anchorDate);
      return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
    }
    return []; // month view doesn't use this
  }, [anchorDate, viewMode]);

  // Query months to fetch
  const queryMonths = useMemo(() => getQueryMonths(anchorDate, viewMode), [anchorDate, viewMode]);

  const eventsQueries = useQuery({
    queryKey: ["training-events", auth.token, ...queryMonths],
    queryFn: async () => {
      const results = await Promise.all(queryMonths.map((m) => api.getTrainingEvents(auth.token, m)));
      return results.flat();
    },
    staleTime: 2 * 60 * 1000
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, TrainingEvent[]>();
    for (const event of eventsQueries.data ?? []) {
      const existing = map.get(event.date) ?? [];
      existing.push(event);
      // Sort by time within each day
      existing.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
      map.set(event.date, existing);
    }
    return map;
  }, [eventsQueries.data]);

  // Navigation
  const navigate = (direction: 1 | -1) => {
    if (viewMode === "month") {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1));
    } else if (viewMode === "week") {
      setAnchorDate(addDays(anchorDate, direction * 7));
    } else if (viewMode === "3day") {
      setAnchorDate(addDays(anchorDate, direction * 3));
    } else {
      setAnchorDate(addDays(anchorDate, direction));
    }
  };

  const goToday = () => setAnchorDate(new Date());

  // Title
  const headerTitle = useMemo(() => {
    if (viewMode === "month") return formatMonthTitle(anchorDate);
    if (viewMode === "day") return formatDayTitle(anchorDate);
    if (viewMode === "week") {
      const monday = getMonday(anchorDate);
      return formatWeekTitle(monday, addDays(monday, 4));
    }
    // 3day
    return formatWeekTitle(anchorDate, addDays(anchorDate, 2));
  }, [anchorDate, viewMode]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: EventFormData) =>
      api.createTrainingEvent(auth.token, {
        title: data.title.trim(),
        date: data.date,
        time: data.time || undefined,
        color: data.color,
        participants: data.participants.split(",").map((p) => p.trim()).filter(Boolean),
        trainer: data.trainer.trim() || undefined,
        department: "sales"
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["training-events"] });
      setModalState({ type: "closed" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: EventFormData }) =>
      api.updateTrainingEvent(auth.token, eventId, {
        title: data.title.trim(),
        date: data.date,
        time: data.time || undefined,
        color: data.color,
        participants: data.participants.split(",").map((p) => p.trim()).filter(Boolean),
        trainer: data.trainer.trim() || undefined
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["training-events"] });
      setModalState({ type: "closed" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => api.deleteTrainingEvent(auth.token, eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["training-events"] });
      setModalState({ type: "closed" });
    }
  });

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const onCreateEvent = (date: string) => setModalState({ type: "create", defaultDate: date });
  const onEditEvent = (event: TrainingEvent) => setModalState({ type: "edit", event });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eğitim Takvimi"
        subtitle="Satış ekibi eğitim planlaması ve takibi"
        actions={
          canEdit ? (
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-900 bg-slate-950 px-4 text-sm font-medium text-white shadow transition hover:bg-slate-800 dark:border-slate-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              onClick={() => onCreateEvent(toDateStr(new Date()))}
              type="button"
            >
              <Plus size={16} /> Etkinlik Ekle
            </button>
          ) : undefined
        }
      />

      <SurfaceCard variant="default">
        {/* Calendar Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button className="inline-flex size-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200" onClick={() => navigate(-1)} type="button">
              <ChevronLeft size={18} />
            </button>
            <button className="inline-flex size-9 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200" onClick={() => navigate(1)} type="button">
              <ChevronRight size={18} />
            </button>
            <h2 className="ml-2 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
              {headerTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex min-h-9 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              onClick={goToday}
              type="button"
            >
              Bugün
            </button>

            {/* View mode selector */}
            <div className="flex items-center gap-0.5 rounded-[10px] border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-600 dark:bg-slate-800/80">
              {VIEW_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={[
                    "flex min-h-8 items-center rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3",
                    viewMode === opt.value
                      ? "bg-slate-950 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  ].join(" ")}
                  onClick={() => setViewMode(opt.value)}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar body */}
        {viewMode === "month" ? (
          <MonthView
            canEdit={canEdit}
            currentDate={anchorDate}
            eventsByDate={eventsByDate}
            onCreateEvent={onCreateEvent}
            onEditEvent={onEditEvent}
          />
        ) : (
          <ColumnView
            canEdit={canEdit}
            days={visibleDays}
            eventsByDate={eventsByDate}
            onCreateEvent={onCreateEvent}
            onEditEvent={onEditEvent}
          />
        )}

        {eventsQueries.isLoading ? (
          <div className="mt-4 text-center text-sm text-slate-400">Etkinlikler yükleniyor...</div>
        ) : null}
      </SurfaceCard>

      {/* Event Form Modal */}
      {modalState.type === "create" ? (
        <EventFormModal open defaultDate={modalState.defaultDate} onClose={() => setModalState({ type: "closed" })} onSave={(data) => createMutation.mutate(data)} saving={isSaving} />
      ) : modalState.type === "edit" ? (
        <EventFormModal open event={modalState.event} onClose={() => setModalState({ type: "closed" })} onDelete={() => deleteMutation.mutate(modalState.event.id)} onSave={(data) => updateMutation.mutate({ eventId: modalState.event.id, data })} saving={isSaving} />
      ) : null}
    </div>
  );
}
