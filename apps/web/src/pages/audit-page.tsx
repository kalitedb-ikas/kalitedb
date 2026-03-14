import { HeatChip } from "@kalitedb/ui";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { resolveThresholdTone, type AgentMetric } from "@kalitedb/shared";
import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { Download, Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { DataTable } from "../components/data-table";
import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatPercent } from "../lib/format";

const columnHelper = createColumnHelper<AgentMetric>();

export function AuditPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(null);

  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token)
  });
  const periodId = searchParams.get("periodId") ?? periodsQuery.data?.[0]?.id;
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId)
  });

  const snapshot = dashboardQuery.data;
  const auditThreshold = snapshot?.thresholds.auditScore;
  const agents = snapshot?.datasets.agentMetrics ?? [];
  const selectedAgent = selectedAgentKey
    ? agents.find((a) => a.agentKey === selectedAgentKey) ?? agents[0]
    : agents[0];

  const columns: ColumnDef<AgentMetric, any>[] = [
    columnHelper.accessor("agentName", { header: "Temsilci" }),
    columnHelper.accessor("auditScore", {
      header: "Audit Skoru",
      cell: (info) => (
        <HeatChip
          tone={auditThreshold ? resolveThresholdTone(info.getValue(), auditThreshold) : "neutral"}
          value={formatPercent(info.getValue())}
        />
      )
    }),
    columnHelper.accessor("missingQuestionsAccuracy", {
      header: "Kayıp Soruları Bilme Oranı",
      cell: (info) => formatPercent(info.getValue())
    }),
    columnHelper.accessor("previousAuditAccuracy", {
      header: "Önceki Audit Doğruluk Oranı",
      cell: (info) => formatPercent(info.getValue())
    })
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      {/* Period Filters */}
      <div className="mb-6">
        <PeriodFilters
          compareToPeriodId={compareToPeriodId}
          onCompareChange={(value) => {
            const next = new URLSearchParams(searchParams);
            if (value) next.set("compareToPeriodId", value);
            else next.delete("compareToPeriodId");
            setSearchParams(next);
          }}
          onPeriodChange={(value) => {
            const next = new URLSearchParams(searchParams);
            next.set("periodId", value);
            setSearchParams(next);
          }}
          periodId={periodId}
          periods={periodsQuery.data ?? []}
        />
      </div>

      {snapshot && selectedAgent ? (
        <div className="flex flex-col gap-8">
          {/* Agent Profile Header */}
          <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 rounded-xl border border-slate-200">
            <div className="flex gap-6 items-center">
              <div className="flex size-24 items-center justify-center rounded-full bg-primary/10 text-primary text-3xl font-bold border-4 border-primary/10">
                {selectedAgent.agentName[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    {selectedAgent.agentName}
                  </h1>
                  {selectedAgent.auditScore && selectedAgent.auditScore >= 90 ? (
                    <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-semibold uppercase tracking-wider">
                      Yüksek Performans
                    </span>
                  ) : null}
                </div>
                <p className="text-slate-500 text-base">Temsilci</p>
                <p className="text-slate-400 text-sm mt-1">
                  Toplam Görüşme: {selectedAgent.totalConversationCount} | Çağrı: {selectedAgent.totalCallCount}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                className="form-select rounded-lg h-11 px-4 bg-slate-100 border-0 text-slate-700 font-bold text-sm"
                onChange={(e) => setSelectedAgentKey(e.target.value)}
                value={selectedAgent.agentKey}
              >
                {agents.map((a) => (
                  <option key={a.agentKey} value={a.agentKey}>{a.agentName}</option>
                ))}
              </select>
              <button className="flex items-center gap-2 rounded-lg h-11 px-6 bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors">
                <Download size={16} />
                <span>Rapor İndir</span>
              </button>
            </div>
          </section>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Skill Set Proficiency Donut */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 h-full">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-slate-900 font-bold text-lg">Beceri Profili</h3>
                <Info size={18} className="text-slate-400" />
              </div>
              <div className="flex flex-col items-center py-4">
                {/* Donut */}
                <div className="relative size-48 flex items-center justify-center mb-6">
                  <svg className="absolute inset-0 size-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth={8} />
                    <circle
                      cx="50" cy="50" r="45" fill="none"
                      stroke="#137fec"
                      strokeWidth={8}
                      strokeDasharray={283}
                      strokeDashoffset={283 - (283 * (selectedAgent.auditScore ?? 0)) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <span className="text-4xl font-bold text-slate-900">
                      {Math.round(selectedAgent.auditScore ?? 0)}
                    </span>
                    <span className="text-xs text-slate-400 font-medium uppercase">Genel Skor</span>
                  </div>
                </div>

                {/* Skill Bars */}
                <div className="w-full space-y-4">
                  <SkillBar label="Audit Skoru" value={selectedAgent.auditScore ?? 0} />
                  <SkillBar label="Kayıp Soru" value={selectedAgent.missingQuestionsAccuracy ?? 0} />
                  <SkillBar label="Önceki Audit" value={selectedAgent.previousAuditAccuracy ?? 0} />
                </div>
              </div>
            </div>

            {/* Monthly Performance Bar Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 h-full">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-slate-900 font-bold text-lg">Temsilci Karşılaştırması</h3>
                  <p className="text-sm text-slate-500">Temsilcilerin audit skorları</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded bg-primary" />
                    <span className="text-xs text-slate-500">Audit Skoru</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded bg-slate-200" />
                    <span className="text-xs text-slate-500">Kayıp Soru</span>
                  </div>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agents.slice(0, 8).map((a) => ({
                    name: a.agentName.split(" ")[0],
                    audit: a.auditScore ?? 0,
                    missing: a.missingQuestionsAccuracy ?? 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <Tooltip />
                    <Bar dataKey="missing" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="audit" fill="#137fec" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Evaluation Results Table */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-slate-900 font-bold text-lg">Temsilci Bazlı Audit Sonuçları</h3>
              <button className="text-primary text-sm font-semibold hover:underline">
                Tümünü Gör
              </button>
            </div>
            <div className="overflow-x-auto">
              <DataTable columns={columns} data={agents} />
            </div>
          </section>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">Veri yükleniyor...</p>
        </div>
      )}
    </div>
  );
}

function SkillBar(props: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{props.label}</span>
        <span className="font-bold text-primary">{formatPercent(props.value)}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${Math.min(props.value, 100)}%` }}
        />
      </div>
    </div>
  );
}
