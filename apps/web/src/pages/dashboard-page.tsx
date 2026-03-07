import { useQuery } from "@tanstack/react-query";
import { Leaderboard, SectionCard, StatCard } from "@kalitedb/ui";
import { useSearchParams } from "react-router-dom";

import { MetricBarChart } from "../components/metric-chart";
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
    <div className="space-y-6">
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

      {snapshot ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Audit ortalaması" tone="green" value={formatPercent(snapshot.summary.auditAverage)} />
            <StatCard label="Kayıp Sorular" tone="yellow" value={formatPercent(snapshot.summary.missingQuestionsAverage)} />
            <StatCard label="CSAT ortalaması" tone="neutral" value={formatNumber(snapshot.summary.csatAverage, 3)} />
            <StatCard
              label="Toplam görüşme"
              tone="neutral"
              value={formatNumber(snapshot.summary.totalConversationCount)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Aylık özet" description="Yükselen ve düşen isimler seçilen karşılaştırma ayına göre hesaplanır.">
              <div className="grid gap-4 md:grid-cols-2">
                <StatCard
                  hint={snapshot.highlights.bestAudit ? snapshot.highlights.bestAudit.label : "Veri yok"}
                  label="En yüksek audit"
                  tone="green"
                  value={formatPercent(snapshot.highlights.bestAudit?.value)}
                />
                <StatCard
                  hint={snapshot.highlights.lowestAudit ? snapshot.highlights.lowestAudit.label : "Veri yok"}
                  label="En düşük audit"
                  tone="red"
                  value={formatPercent(snapshot.highlights.lowestAudit?.value)}
                />
                <StatCard
                  hint={snapshot.highlights.bestCsat ? snapshot.highlights.bestCsat.label : "Veri yok"}
                  label="En yüksek CSAT"
                  tone="green"
                  value={formatNumber(snapshot.highlights.bestCsat?.value, 3)}
                />
                <StatCard
                  hint={
                    snapshot.highlights.mostImproved
                      ? `${snapshot.highlights.mostImproved.label} (${formatDelta(snapshot.highlights.mostImproved.delta)})`
                      : "Veri yok"
                  }
                  label="En çok yükselen"
                  tone="yellow"
                  value={snapshot.highlights.mostImproved?.label ?? "-"}
                />
              </div>
            </SectionCard>

            <MetricBarChart
              color="#EB7155"
              data={(snapshot.rankings.auditTop ?? []).map((item) => ({
                label: item.label,
                value: item.value ?? 0
              }))}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Leaderboard
              items={snapshot.rankings.auditTop.map((item) => ({
                id: item.id,
                label: item.label,
                value: formatPercent(item.value),
                delta: formatDelta(item.delta)
              }))}
              title="Audit liderleri"
            />
            <Leaderboard
              items={snapshot.rankings.csatTop.map((item) => ({
                id: item.id,
                label: item.label,
                value: formatNumber(item.value, 3),
                delta: formatDelta(item.delta)
              }))}
              title="CSAT liderleri"
            />
          </div>
        </>
      ) : (
        <SectionCard title="Genel Bakış">
          <p className="text-sm text-slate-500">Veri yükleniyor veya henüz dönem bulunmuyor.</p>
        </SectionCard>
      )}
    </div>
  );
}
