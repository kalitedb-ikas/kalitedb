import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  TrendingUp,
  Users,
  Timer,
  DollarSign,
  Calendar,
  Download,
  AlertTriangle,
  Rocket,
  CheckCircle2
} from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart
} from "recharts";

import { PeriodFilters } from "../components/period-filters";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatDelta, formatNumber, formatPercent } from "../lib/format";

export function DashboardPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

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

  return (
    <div className="max-w-[1600px] mx-auto w-full px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Genel Bakış</h1>
          <p className="text-slate-500 text-lg mt-1">Kalite organizasyonunuzun anlık durumu.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold shadow-sm hover:shadow-md transition-all">
            <Calendar size={16} />
            {snapshot?.period.title ?? "Dönem seçin"}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/25 hover:opacity-90 transition-all">
            <Download size={16} />
            PDF İndir
          </button>
        </div>
      </div>

      {/* Period Filters */}
      <div className="mb-8">
        <PeriodFilters
          compareToPeriodId={compareToPeriodId}
          onCompareChange={(value) => {
            const next = new URLSearchParams(searchParams);
            if (value) {
              next.set("compareToPeriodId", value);
            } else {
              next.delete("compareToPeriodId");
            }
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

      {snapshot ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <KpiCard
              icon={<TrendingUp size={20} />}
              iconBg="bg-primary/10 text-primary"
              label="Audit Ortalaması"
              value={formatPercent(snapshot.summary.auditAverage)}
              badge={snapshot.highlights.bestAudit?.delta != null ? formatDelta(snapshot.highlights.bestAudit.delta) + "%" : ""}
              badgePositive={snapshot.highlights.bestAudit?.delta != null && snapshot.highlights.bestAudit.delta >= 0}
            />
            <KpiCard
              icon={<Users size={20} />}
              iconBg="bg-purple-100 text-purple-600"
              label="Kayıp Soru Ortalaması"
              value={formatPercent(snapshot.summary.missingQuestionsAverage)}
            />
            <KpiCard
              icon={<Timer size={20} />}
              iconBg="bg-blue-100 text-blue-600"
              label="CSAT Ortalaması"
              value={formatNumber(snapshot.summary.csatAverage, 3)}
            />
            <KpiCard
              icon={<DollarSign size={20} />}
              iconBg="bg-orange-100 text-orange-600"
              label="Toplam Görüşme"
              value={formatNumber(snapshot.summary.totalConversationCount)}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Success Distribution Donut */}
            <div className="lg:col-span-1 bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
              <h2 className="text-xl font-bold text-slate-900 mb-8 self-start">Başarı Dağılımı</h2>
              <SuccessDonut
                overall={snapshot.summary.auditAverage ?? 0}
                segments={[
                  { label: "Audit", value: snapshot.summary.auditAverage ?? 0, color: "#137fec" },
                  { label: "Kayıp Soru", value: snapshot.summary.missingQuestionsAverage ?? 0, color: "#a78bfa" },
                  { label: "CSAT (x20)", value: (snapshot.summary.csatAverage ?? 0) * 20, color: "#fb923c" }
                ]}
              />
            </div>

            {/* Performance Trends Line Chart */}
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Performans Trendleri</h2>
                  <p className="text-slate-500 text-sm">Audit skoru ve CSAT değişimi</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <span className="size-3 bg-primary rounded-full" />
                    <span className="text-xs font-semibold text-slate-600">Audit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-3 bg-rose-400 rounded-full" />
                    <span className="text-xs font-semibold text-slate-600">CSAT</span>
                  </div>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={buildTrendData(snapshot.datasets.agentMetrics)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="audit"
                      stroke="#137fec"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="csat"
                      stroke="#fb7185"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Top Performing Agents */}
            <div className="xl:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-slate-900">En İyi Temsilciler</h2>
                <button className="text-primary text-sm font-bold hover:underline">Tümünü Gör</button>
              </div>
              <div className="space-y-5">
                {snapshot.rankings.auditTop.slice(0, 5).map((agent) => (
                  <div key={agent.id} className="flex items-center gap-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary text-lg font-bold">
                      {agent.label[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-slate-900 font-bold truncate">{agent.label}</h4>
                      <p className="text-slate-500 text-xs">
                        {agent.delta != null ? `Değişim: ${formatDelta(agent.delta)}` : "Temsilci"}
                      </p>
                    </div>
                    <div className="hidden sm:flex flex-col items-end mr-6">
                      <p className="text-slate-400 text-[10px] font-bold uppercase">Başarı Oranı</p>
                      <p className="text-slate-900 font-black">{formatPercent(agent.value)}</p>
                    </div>
                    <div className="flex-1 max-w-[200px] h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(agent.value ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Strategic Focus / Alerts */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Stratejik Odak</h2>
              <div className="space-y-4">
                {/* Churn Risk / Lowest Audit */}
                {snapshot.highlights.lowestAudit ? (
                  <AlertCard
                    icon={<AlertTriangle size={18} />}
                    iconBg="bg-rose-100 text-rose-600"
                    cardBg="bg-rose-50 border-rose-100"
                    title="Düşük Performans Uyarısı"
                    description={`${snapshot.highlights.lowestAudit.label} audit skoru ${formatPercent(snapshot.highlights.lowestAudit.value)} ile en düşük seviyede.`}
                  />
                ) : null}

                {/* Upsell / Most Improved */}
                {snapshot.highlights.mostImproved ? (
                  <AlertCard
                    icon={<Rocket size={18} />}
                    iconBg="bg-primary/10 text-primary"
                    cardBg="bg-primary/5 border-primary/10"
                    title="Yükselen Performans"
                    description={`${snapshot.highlights.mostImproved.label} en çok gelişim gösteren temsilci (${formatDelta(snapshot.highlights.mostImproved.delta)}).`}
                  />
                ) : null}

                {/* NPS / Best Audit */}
                {snapshot.highlights.bestAudit ? (
                  <AlertCard
                    icon={<CheckCircle2 size={18} />}
                    iconBg="bg-slate-200 text-slate-600"
                    cardBg="bg-slate-50 border-slate-200"
                    title="En Yüksek Audit"
                    description={`${snapshot.highlights.bestAudit.label} bu dönem ${formatPercent(snapshot.highlights.bestAudit.value)} ile en yüksek audit skorunu aldı.`}
                  />
                ) : null}
              </div>
              <button className="w-full mt-6 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors">
                Stratejik Yol Haritasını Görüntüle
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center">
          <p className="text-slate-500">Veri yükleniyor veya henüz dönem bulunmuyor.</p>
        </div>
      )}
    </div>
  );
}

/* ---- Sub-components ---- */

function KpiCard(props: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  badge?: string | undefined;
  badgePositive?: boolean | undefined;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-lg ${props.iconBg}`}>
          {props.icon}
        </div>
        {props.badge ? (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            props.badgePositive
              ? "bg-emerald-50 text-emerald-500"
              : "bg-rose-50 text-rose-500"
          }`}>
            {props.badge}
          </span>
        ) : null}
      </div>
      <p className="text-slate-500 text-sm font-medium">{props.label}</p>
      <h3 className="text-slate-900 text-3xl font-bold mt-1">{props.value}</h3>
    </div>
  );
}

function AlertCard(props: {
  icon: React.ReactNode;
  iconBg: string;
  cardBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className={`p-4 rounded-2xl border flex gap-4 ${props.cardBg}`}>
      <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${props.iconBg}`}>
        {props.icon}
      </div>
      <div>
        <h5 className="text-slate-900 font-bold text-sm">{props.title}</h5>
        <p className="text-slate-600 text-xs mt-1">{props.description}</p>
      </div>
    </div>
  );
}

function SuccessDonut(props: {
  overall: number;
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const radii = [110, 80, 55];
  const strokeWidths = [24, 18, 12];
  const circumferences = radii.map((r) => 2 * Math.PI * r);

  return (
    <div className="flex flex-col items-center">
      <div className="relative size-64 flex items-center justify-center">
        <svg className="size-full transform -rotate-90" viewBox="0 0 256 256">
          {props.segments.map((seg, i) => {
            const r = radii[i] ?? 55;
            const sw = strokeWidths[i] ?? 12;
            const circ = circumferences[i] ?? 345;
            const offset = circ - (circ * Math.min(seg.value, 100)) / 100;
            return (
              <g key={seg.label}>
                <circle
                  cx="128"
                  cy="128"
                  r={r}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth={sw}
                />
                <circle
                  cx="128"
                  cy="128"
                  r={r}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth={sw}
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-slate-900">
            {Math.round(props.overall)}%
          </span>
          <span className="text-sm text-slate-500 font-medium">Genel Skor</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-8 w-full">
        {props.segments.map((seg) => (
          <div key={seg.label} className="text-center">
            <div
              className="size-2 rounded-full mx-auto mb-1"
              style={{ backgroundColor: seg.color }}
            />
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
              {seg.label}
            </p>
            <p className="font-bold text-slate-800">{Math.round(seg.value)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildTrendData(
  metrics: Array<{ agentName: string; auditScore: number | null; callEvaluationAverage: number | null }>
) {
  return metrics.slice(0, 12).map((m) => ({
    name: m.agentName.split(" ")[0],
    audit: m.auditScore ?? 0,
    csat: ((m.callEvaluationAverage ?? 0) * 20)
  }));
}
