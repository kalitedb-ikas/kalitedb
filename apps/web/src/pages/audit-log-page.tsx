import { PageHeader, SurfaceCard } from "@kalitedb/ui";
import { collection, getDocs, orderBy, query, limit, where, type Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { firebaseDb } from "../lib/firebase";
import { FancySelect } from "../components/fancy-select";

/* ── Tipler ── */

type AuditLogEntry = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  userEmail: string;
  userName: string | null;
  details: Record<string, unknown> | null;
  timestamp: string;
};

/* ── Sabitler ── */

const ACTION_LABELS: Record<string, string> = {
  login: "Giriş",
  logout: "Çıkış",
  create: "Oluşturma",
  update: "Güncelleme",
  delete: "Silme",
  import: "İçe Aktarma",
  publish: "Yayımlama",
  reopen: "Yeniden Açma"
};

const RESOURCE_LABELS: Record<string, string> = {
  session: "Oturum",
  reportPeriod: "Dönem",
  dataset: "Veri Kümesi",
  userRole: "Kullanıcı Rolü",
  representative: "Temsilci",
  "agent-metrics": "Agent Metrikleri",
  "audit-metrics": "Audit Metrikleri",
  "question-performance": "Soru Performansı",
  "qt-metrics": "QT Metrikleri",
  salesKpi: "Satış KPI",
  salesMeeting: "Satış Toplantısı",
  trainingEvent: "Eğitim Etkinliği",
  threshold: "Eşik Değeri"
};

const ACTION_COLORS: Record<string, string> = {
  login: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  logout: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400",
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  update: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  delete: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  import: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  publish: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  reopen: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
};

/* ── Sayfa ── */

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [pageSize] = useState(100);

  useEffect(() => {
    if (!firebaseDb) {
      setLoading(false);
      return;
    }

    const fetchLogs = async () => {
      setLoading(true);
      try {
        const constraints: Parameters<typeof query>[1][] = [orderBy("timestamp", "desc"), limit(pageSize)];
        if (actionFilter) constraints.push(where("action", "==", actionFilter));
        if (userFilter) constraints.push(where("userEmail", "==", userFilter));

        const q = query(collection(firebaseDb!, "auditLogs"), ...constraints);
        const snap = await getDocs(q);
        const entries: AuditLogEntry[] = snap.docs.map((doc) => {
          const d = doc.data();
          const ts = d.timestamp;
          let timestampStr = "";
          if (typeof ts === "string") {
            timestampStr = ts;
          } else if (ts && typeof ts.toDate === "function") {
            timestampStr = (ts as Timestamp).toDate().toISOString();
          }
          return {
            id: doc.id,
            action: d.action ?? "",
            resource: d.resource ?? "",
            resourceId: d.resourceId ?? null,
            userEmail: d.userEmail ?? "",
            userName: d.userName ?? null,
            details: d.details ?? null,
            timestamp: timestampStr
          };
        });
        setLogs(entries);
      } catch (err) {
        console.error("Audit log yüklenemedi:", err);
      } finally {
        setLoading(false);
      }
    };

    void fetchLogs();
  }, [actionFilter, userFilter, pageSize]);

  const uniqueUsers = useMemo(() => {
    const set = new Set(logs.map((l) => l.userEmail).filter(Boolean));
    return Array.from(set).sort();
  }, [logs]);

  const actionOptions = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));

  function formatTimestamp(iso: string) {
    if (!iso) return "-";
    try {
      return new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function formatDetails(details: Record<string, unknown> | null) {
    if (!details) return null;
    return Object.entries(details)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(", ");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="İşlem Geçmişi"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FancySelect
              size="sm"
              value={actionFilter}
              onChange={setActionFilter}
              options={[{ value: "", label: "Tüm İşlemler" }, ...actionOptions]}
              placeholder="İşlem filtrele"
              panelWidthClass="w-44"
            />
            {uniqueUsers.length > 0 && (
              <FancySelect
                size="sm"
                value={userFilter}
                onChange={setUserFilter}
                options={[{ value: "", label: "Tüm Kullanıcılar" }, ...uniqueUsers.map((u) => ({ value: u, label: u }))]}
                placeholder="Kullanıcı filtrele"
                panelWidthClass="w-56"
              />
            )}
          </div>
        }
      />

      {loading ? (
        <SurfaceCard variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Loglar yükleniyor...</p>
        </SurfaceCard>
      ) : logs.length === 0 ? (
        <SurfaceCard variant="default">
          <p className="text-sm text-slate-600 dark:text-slate-400">Henüz kayıt bulunamadı.</p>
        </SurfaceCard>
      ) : (
        <SurfaceCard variant="default">
          <div className="-m-5 overflow-x-auto sm:-m-6">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tarih</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kullanıcı</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">İşlem</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kaynak</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Detay</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className={[
                      "border-b border-slate-100 dark:border-slate-700/50",
                      idx % 2 === 0 ? "bg-white dark:bg-slate-800/30" : "bg-slate-50/50 dark:bg-slate-800/50"
                    ].join(" ")}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{log.userName ?? log.userEmail.split("@")[0]}</span>
                      <span className="ml-1 text-slate-400 dark:text-slate-500 text-xs">{log.userEmail}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-600"}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">
                      {RESOURCE_LABELS[log.resource] ?? log.resource}
                      {log.resourceId && (
                        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">{log.resourceId}</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400" title={formatDetails(log.details) ?? ""}>
                      {formatDetails(log.details) ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
