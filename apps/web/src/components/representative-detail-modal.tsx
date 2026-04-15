import type { Department, Representative, TimelineEvent } from "@kalitedb/shared";
import { BarChart3, Crown, Headphones, MessageSquare, Phone, Rocket, ShoppingBag, Star, Ticket, Plus, Trash2, X, Zap } from "lucide-react";
import { type ReactNode, useState } from "react";

import { getRepresentativePhotoSrc } from "../lib/representative-photos";

/* ── Badge tanımları ── */

export const BADGE_DEFINITIONS: { key: string; label: string; color: string; icon: ReactNode }[] = [
  { key: "chat_mail", label: "Chat/Mail", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/40", icon: <MessageSquare size={12} /> },
  { key: "cagri", label: "Çağrı", color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/40", icon: <Phone size={12} /> },
  { key: "satis", label: "Satış", color: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-700/40", icon: <ShoppingBag size={12} /> },
  { key: "ticket", label: "Ticket", color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700/40", icon: <Ticket size={12} /> },
  { key: "satisfaction", label: "Satisfaction", color: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700/40", icon: <Star size={12} /> },
  { key: "premium_onboarding", label: "Premium Onboarding", color: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700/40", icon: <Rocket size={12} /> },
  { key: "premium", label: "Premium", color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/40", icon: <Crown size={12} /> },
  { key: "start", label: "Start", color: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600", icon: <Zap size={12} /> },
  { key: "revops", label: "RevOPS", color: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700/40", icon: <BarChart3 size={12} /> },
  { key: "cs", label: "CS", color: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700/40", icon: <Headphones size={12} /> },
];

export function BadgePill(props: { badgeKey: string; small?: boolean }) {
  const def = BADGE_DEFINITIONS.find((b) => b.key === props.badgeKey);
  if (!def) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${props.small ? "text-[10px]" : "text-xs"} font-medium ${def.color}`}>
      {def.icon}
      {def.label}
    </span>
  );
}

/* ── Timeline gösterimi ── */

export function TimelineDisplay(props: { events: TimelineEvent[] }) {
  const sorted = [...props.events].sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (sorted.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Henüz kayıt yok.</p>;

  return (
    <div className="relative ml-3 border-l-2 border-slate-200 pl-6 dark:border-slate-600">
      {sorted.map((event, idx) => (
        <div key={event.id} className={`relative pb-6 ${idx === sorted.length - 1 ? "pb-0" : ""}`}>
          <div className="absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full border-2 border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
            <div className={`size-2 rounded-full ${event.endDate ? "bg-slate-400" : "bg-emerald-500"}`} />
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {event.startDate}{event.endDate ? ` — ${event.endDate}` : " — Devam ediyor"}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── Modal ── */

type SaveData = {
  displayName?: string;
  department?: Department;
  badges: string[];
  timeline: TimelineEvent[];
};

type Props = {
  representative?: Representative;
  mode?: "create" | "edit";
  defaultDepartment?: Department;
  onSave: (data: SaveData) => void;
  onClose: () => void;
  isSaving: boolean;
};

export function RepresentativeDetailModal({ representative, mode = "edit", defaultDepartment = "cs", onSave, onClose, isSaving }: Props) {
  const isCreate = mode === "create";
  const [displayName, setDisplayName] = useState(representative?.displayName ?? "");
  const [department, setDepartment] = useState<Department>((representative?.department as Department) ?? defaultDepartment);
  const [badges, setBadges] = useState<string[]>(representative?.badges ?? []);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(representative?.timeline ?? []);

  // Timeline form state
  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [tlTitle, setTlTitle] = useState("");
  const [tlStartDate, setTlStartDate] = useState("");
  const [tlEndDate, setTlEndDate] = useState("");
  const [tlDepartment, setTlDepartment] = useState("");

  const photoSrc = representative ? getRepresentativePhotoSrc(representative.displayName) : undefined;

  const toggleBadge = (key: string) => {
    setBadges((prev) => prev.includes(key) ? prev.filter((b) => b !== key) : [...prev, key]);
  };

  const addTimelineEvent = () => {
    if (!tlTitle.trim() || !tlStartDate) return;
    const event: TimelineEvent = {
      id: Math.random().toString(36).slice(2, 10),
      title: tlTitle.trim(),
      startDate: tlStartDate,
      endDate: tlEndDate || undefined,
      department: tlDepartment || undefined
    };
    setTimeline((prev) => [...prev, event]);
    setTlTitle("");
    setTlStartDate("");
    setTlEndDate("");
    setTlDepartment("");
    setShowTimelineForm(false);
  };

  const removeTimelineEvent = (id: string) => {
    setTimeline((prev) => prev.filter((e) => e.id !== id));
  };

  const handleSave = () => {
    onSave({
      ...(isCreate || displayName !== representative?.displayName ? { displayName } : {}),
      department,
      badges,
      timeline
    });
  };

  const statusLabel = !representative ? "" : representative.status === "active" ? "Aktif" : representative.status === "departed" ? "Ayrıldı" : "Departman Değişti";
  const statusColor = !representative ? "" : representative.status === "active"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : representative.status === "departed"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[10px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-slate-600 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>

        {/* ── Üst: Foto + İsim ── */}
        <div className="flex items-center gap-4">
          {photoSrc ? (
            <div className="size-16 shrink-0 overflow-hidden rounded-[10px] border border-slate-200 dark:border-slate-600">
              <img alt={representative?.displayName ?? ""} className="size-full object-cover" src={photoSrc} />
            </div>
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-[10px] border border-slate-200 bg-slate-100 text-lg font-bold text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {(displayName || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {isCreate ? (
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Yeni Temsilci</h2>
            ) : (
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{representative?.displayName}</h2>
            )}
            {representative && !isCreate && (
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{representative.department === "sales" ? "Satış" : representative.department === "quality" ? "Kalite" : representative.department === "partner" ? "Partner" : "CS"}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── İsim + Departman (create veya edit) ── */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">İsim {isCreate && "*"}</label>
            <input
              className="mt-1 h-9 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#2f6b7a]/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Temsilci adı"
              value={displayName}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Departman{isCreate && " *"}</label>
            <select
              className="mt-1 h-9 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#2f6b7a]/40 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              onChange={(e) => setDepartment(e.target.value as Department)}
              value={department}
            >
              <option value="cs">CS</option>
              <option value="sales">Satış</option>
              <option value="quality">Kalite</option>
              <option value="partner">Partner</option>
            </select>
          </div>
        </div>

        {/* ── Badge'ler ── */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Etiketler</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {BADGE_DEFINITIONS.map((def) => {
              const isActive = badges.includes(def.key);
              return (
                <button
                  key={def.key}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    isActive
                      ? def.color
                      : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-300"
                  ].join(" ")}
                  onClick={() => toggleBadge(def.key)}
                  type="button"
                >
                  {def.icon}
                  {def.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Kariyer Zaman Çizelgesi ── */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Kariyer Zaman Çizelgesi</h3>
            <button
              className="inline-flex items-center gap-1 rounded-[10px] border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              onClick={() => setShowTimelineForm(!showTimelineForm)}
              type="button"
            >
              {showTimelineForm ? <X size={12} /> : <Plus size={12} />}
              {showTimelineForm ? "İptal" : "Ekle"}
            </button>
          </div>

          {showTimelineForm && (
            <div className="mt-3 grid gap-2 rounded-[10px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-700/30 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500">Başlık *</label>
                <input
                  className="mt-1 h-9 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  onChange={(e) => setTlTitle(e.target.value)}
                  placeholder="Ör: CS Ekibi, Satış Ekibi"
                  value={tlTitle}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Başlangıç *</label>
                <input
                  className="mt-1 h-9 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  onChange={(e) => setTlStartDate(e.target.value)}
                  type="date"
                  value={tlStartDate}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Bitiş <span className="text-slate-400">(boş = devam ediyor)</span></label>
                <input
                  className="mt-1 h-9 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  onChange={(e) => setTlEndDate(e.target.value)}
                  type="date"
                  value={tlEndDate}
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <button
                  className="h-9 rounded-[10px] bg-[#2f6b7a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#285d6a] disabled:opacity-50"
                  disabled={!tlTitle.trim() || !tlStartDate}
                  onClick={addTimelineEvent}
                  type="button"
                >
                  Ekle
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            {timeline.length > 0 ? (
              <div className="relative ml-3 border-l-2 border-slate-200 pl-6 dark:border-slate-600">
                {[...timeline].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((event, idx, arr) => (
                  <div key={event.id} className={`relative pb-5 ${idx === arr.length - 1 ? "pb-0" : ""}`}>
                    <div className="absolute -left-[31px] top-1 flex size-4 items-center justify-center rounded-full border-2 border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
                      <div className={`size-2 rounded-full ${event.endDate ? "bg-slate-400" : "bg-emerald-500"}`} />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {event.startDate}{event.endDate ? ` — ${event.endDate}` : " — Devam ediyor"}
                        </p>
                      </div>
                      <button
                        className="mt-0.5 rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                        onClick={() => removeTimelineEvent(event.id)}
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Henüz kariyer kaydı eklenmemiş.</p>
            )}
          </div>
        </div>

        {/* ── Kaydet ── */}
        <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-slate-600">
          <button
            className="h-10 rounded-[10px] bg-[#2f6b7a] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[#285d6a] disabled:opacity-50"
            disabled={isSaving || (isCreate && !displayName.trim())}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "Kaydediliyor..." : isCreate ? "Oluştur" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
