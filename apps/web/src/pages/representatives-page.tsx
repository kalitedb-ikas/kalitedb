import { resolveThresholdTone, selectAuditMetrics } from "@kalitedb/shared";
import { SectionCard, StatCard } from "@kalitedb/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { formatAuditScore, formatNumber, formatPercent, formatSeconds, formatPeriodMonth, getPreviousPeriod } from "../lib/format";
import { getRepresentativePhotoSrc } from "../lib/representative-photos";

function formatOrNa(value: number | null | undefined, formatter: (value: number) => string) {
  return value === null || value === undefined ? "N/A" : formatter(value);
}

function resolveCsatTone(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "neutral" as const;
  }

  if (value > 4.9) {
    return "green" as const;
  }

  if (value >= 4.8) {
    return "yellow" as const;
  }

  return "red" as const;
}

function computeSuccessIndex(params: {
  callEvaluationAverage: number | null | undefined;
  auditScore: number | null | undefined;
  localCloseRate: number | null | undefined;
}) {
  const metrics: number[] = [];

  if (params.callEvaluationAverage !== null && params.callEvaluationAverage !== undefined) {
    metrics.push(Math.max(0, Math.min(100, params.callEvaluationAverage * 20)));
  }

  if (params.auditScore !== null && params.auditScore !== undefined) {
    metrics.push(params.auditScore);
  }

  if (params.localCloseRate !== null && params.localCloseRate !== undefined) {
    metrics.push(params.localCloseRate);
  }

  if (metrics.length === 0) {
    return null;
  }

  return metrics.reduce((sum, value) => sum + value, 0) / metrics.length;
}

function resolveSuccessState(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return {
      label: "Beklemede",
      accentClass: "text-slate-500",
      pillClass: "border-slate-200 bg-slate-100 text-slate-600"
    };
  }

  if (value >= 85) {
    return {
      label: "İyi",
      accentClass: "text-emerald-700",
      pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }

  if (value >= 70) {
    return {
      label: "İzlenmeli",
      accentClass: "text-sky-700",
      pillClass: "border-sky-200 bg-sky-50 text-sky-700"
    };
  }

  return {
    label: "Geliştirilmeli",
    accentClass: "text-rose-700",
    pillClass: "border-rose-200 bg-rose-50 text-rose-700"
  };
}

export function RepresentativesPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetTypes = ["agent-metrics", "audit-metrics"] as const;
  const periodsQuery = useQuery({
    queryKey: ["periods", auth.token],
    queryFn: () => api.getPeriods(auth.token),
    staleTime: 5 * 60 * 1000
  });
  const periodId = searchParams.get("periodId") ?? periodsQuery.data?.[0]?.id;
  const compareToPeriodId = searchParams.get("compareToPeriodId") ?? undefined;
  const dashboardQuery = useQuery({
    enabled: Boolean(periodId),
    queryKey: ["dashboard", auth.token, periodId, compareToPeriodId, datasetTypes.join(",")],
    queryFn: () => api.getDashboard(auth.token, periodId, compareToPeriodId, { datasetTypes: [...datasetTypes] }),
    staleTime: 60 * 1000
  });

  const snapshot = dashboardQuery.data;
  const auditMetrics = useMemo(
    () => selectAuditMetrics(snapshot?.datasets ?? { agentMetrics: [], auditMetrics: [] }),
    [snapshot]
  );

  const representatives = useMemo(() => {
    const options = new Map<string, string>();
    (snapshot?.datasets.agentMetrics ?? []).forEach((record) => options.set(record.agentKey, record.agentName));
    auditMetrics.forEach((record) => options.set(record.agentKey, record.agentName));

    return Array.from(options.entries())
      .map(([agentKey, agentName]) => ({ agentKey, agentName }))
      .sort((left, right) => left.agentName.localeCompare(right.agentName, "tr"))
      .map((item, index) => ({
        ...item,
        avatarSrc: buildRepresentativeAvatar(item.agentName, index, "square"),
        portraitSrc: buildRepresentativeAvatar(item.agentName, index, "landscape")
      }));
  }, [auditMetrics, snapshot]);

  const selectedAgentKey = searchParams.get("agentKey") ?? representatives[0]?.agentKey;
  const selectedRepresentative = representatives.find((item) => item.agentKey === selectedAgentKey) ?? representatives[0] ?? null;
  const selectedAgent =
    snapshot?.datasets.agentMetrics.find((record) => record.agentKey === selectedRepresentative?.agentKey) ?? null;
  const selectedAudit = auditMetrics.find((record) => record.agentKey === selectedRepresentative?.agentKey) ?? null;

  const selectedName = selectedRepresentative?.agentName ?? "N/A";
  const selectedSuccessIndex = computeSuccessIndex({
    callEvaluationAverage: selectedAgent?.callEvaluationAverage,
    auditScore: selectedAudit?.auditScore,
    localCloseRate: selectedAgent?.localCloseRate
  });
  const selectedState = resolveSuccessState(selectedSuccessIndex);
  const previousAuditAccuracyLabel = useMemo(() => {
    const previousPeriod = getPreviousPeriod(snapshot?.period.month);
    return previousPeriod ? `${formatPeriodMonth(previousPeriod, { includeYear: true })} audit doğruluk oranı` : "Önceki audit doğruluk oranı";
  }, [snapshot?.period.month]);

  const representativeRanking = useMemo(
    () =>
      representatives
        .map((item) => {
          const agent = snapshot?.datasets.agentMetrics.find((record) => record.agentKey === item.agentKey) ?? null;
          const audit = auditMetrics.find((record) => record.agentKey === item.agentKey) ?? null;

          return {
            agentKey: item.agentKey,
            successIndex: computeSuccessIndex({
              callEvaluationAverage: agent?.callEvaluationAverage,
              auditScore: audit?.auditScore,
              localCloseRate: agent?.localCloseRate
            })
          };
        })
        .sort((left, right) => (right.successIndex ?? -1) - (left.successIndex ?? -1)),
    [auditMetrics, representatives, snapshot]
  );

  const selectedRank =
    selectedRepresentative == null
      ? null
      : representativeRanking.findIndex((item) => item.agentKey === selectedRepresentative.agentKey) + 1 || null;

  const handleRepresentativeChange = (agentKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("agentKey", agentKey);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Temsilci bazlı rapor"
        actions={
          <select
            className="rounded-full border border-white/45 bg-white/72 px-3 py-2 text-sm font-medium text-slate-700 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/15"
            onChange={(event) => handleRepresentativeChange(event.target.value)}
            value={selectedRepresentative?.agentKey ?? ""}
          >
            {representatives.map((item) => (
              <option key={item.agentKey} value={item.agentKey}>
                {item.agentName}
              </option>
            ))}
          </select>
        }
      >
        {selectedRepresentative ? (
          <div className="space-y-6">
            <section className="surface-default rounded-[30px] border border-white/75 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="grid gap-6 xl:grid-cols-2 xl:items-stretch">
                <div className="flex items-center justify-center rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,#f8fbff,#eaf4ff)] p-5">
                  <div className="w-full max-w-[420px]">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#eff6ff,#dbeafe)] shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                      <img alt={selectedName} className="h-full w-full object-cover" src={selectedRepresentative.portraitSrc} />
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white/78 p-6">
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950">{selectedName}</h2>
                      {selectedRank === 1 ? (
                        <p className={`mt-2 text-lg font-semibold ${selectedState.accentClass}`}>En yüksek performans</p>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CSAT</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatOrNa(selectedAgent?.callEvaluationAverage, (value) => formatNumber(value, 3))}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Audit</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatOrNa(selectedAudit?.auditScore, formatAuditScore)}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Görüşme</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatOrNa(selectedAgent?.totalConversationCount, (value) => formatNumber(value))}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lokal kapatma</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatOrNa(selectedAgent?.localCloseRate, (value) => formatPercent(value))}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Konuşma süresi</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatOrNa(selectedAgent?.avgTalkDurationSeconds, (value) => formatSeconds(value))}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Değerlendirme</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatOrNa(selectedAgent?.evaluationCount, (value) => formatNumber(value))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Audit skoru"
                tone={
                  snapshot
                    ? resolveThresholdTone(selectedAudit?.auditScore ?? null, snapshot.thresholds.auditScore)
                    : "neutral"
                }
                value={formatOrNa(selectedAudit?.auditScore, formatAuditScore)}
              />
              <StatCard
                label={previousAuditAccuracyLabel}
                tone="yellow"
                value={formatOrNa(selectedAudit?.previousAuditAccuracy, (value) => formatPercent(value))}
              />
              <StatCard
                label="CSAT"
                tone={resolveCsatTone(selectedAgent?.callEvaluationAverage)}
                value={formatOrNa(selectedAgent?.callEvaluationAverage, (value) => formatNumber(value, 3))}
              />
              <StatCard
                label="Toplam görüşme adedi"
                tone="neutral"
                value={formatOrNa(selectedAgent?.totalConversationCount, (value) => formatNumber(value))}
              />
              <StatCard
                label="Lokal kapatma oranı"
                tone={
                  snapshot
                    ? resolveThresholdTone(selectedAgent?.localCloseRate ?? null, snapshot.thresholds.localCloseRate)
                    : "neutral"
                }
                value={formatOrNa(selectedAgent?.localCloseRate, (value) => formatPercent(value))}
              />
              <StatCard
                label="Ortalama konuşma süresi"
                tone={
                  snapshot
                    ? resolveThresholdTone(
                        selectedAgent?.avgTalkDurationSeconds ?? null,
                        snapshot.thresholds.avgTalkDurationSeconds
                      )
                    : "neutral"
                }
                value={formatOrNa(selectedAgent?.avgTalkDurationSeconds, (value) => formatSeconds(value))}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="Çağrı ve işlem detayları">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                    <p className="text-sm text-slate-600">Toplam çağrı adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatOrNa(selectedAgent?.totalCallCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                    <p className="text-sm text-slate-600">Toplam chat / e-posta adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatOrNa(selectedAgent?.totalChatMailCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                    <p className="text-sm text-slate-600">Toplam ticket kapatma adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatOrNa(selectedAgent?.totalTicketClosedCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                    <p className="text-sm text-slate-600">Kaçan çağrılar</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatOrNa(selectedAgent?.missedCalls, (value) => formatNumber(value))}
                    </p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Değerlendirme detayları">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                    <p className="text-sm text-slate-600">Değerlendirme adedi</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatOrNa(selectedAgent?.evaluationCount, (value) => formatNumber(value))}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/45 bg-white/62 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
                    <p className="text-sm text-slate-600">Temsilci</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{selectedName}</p>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Seçilen dönemde gösterilecek temsilci verisi bulunamadı.</p>
        )}
      </SectionCard>
    </div>
  );
}

function buildRepresentativeAvatar(name: string, index: number, variant: "square" | "landscape") {
  const repositoryPhoto = getRepresentativePhotoSrc(name);
  if (repositoryPhoto) {
    return repositoryPhoto;
  }

  const palettes: Array<{ start: string; end: string; glow: string }> = [
    { start: "#60a5fa", end: "#2563eb", glow: "#bfdbfe" },
    { start: "#38bdf8", end: "#0f766e", glow: "#a5f3fc" },
    { start: "#f59e0b", end: "#f97316", glow: "#fde68a" },
    { start: "#a78bfa", end: "#7c3aed", glow: "#ddd6fe" }
  ];
  const palette = palettes[index % palettes.length] ?? palettes[0] ?? { start: "#60a5fa", end: "#2563eb", glow: "#bfdbfe" };
  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (variant === "square") {
    const squareSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${palette.start}" />
            <stop offset="100%" stop-color="${palette.end}" />
          </linearGradient>
        </defs>
        <rect width="160" height="160" rx="36" fill="url(#bg)" />
        <circle cx="36" cy="38" r="24" fill="${palette.glow}" opacity="0.28" />
        <circle cx="126" cy="128" r="18" fill="white" opacity="0.14" />
        <text
          x="50%"
          y="54%"
          dominant-baseline="middle"
          text-anchor="middle"
          fill="white"
          font-family="Inter, Arial, sans-serif"
          font-size="50"
          font-weight="700"
          letter-spacing="4"
        >
          ${initials}
        </text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(squareSvg)}`;
  }

  const landscapeSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="480" height="360" rx="42" fill="url(#bg)" />
      <circle cx="88" cy="74" r="52" fill="${palette.glow}" opacity="0.25" />
      <circle cx="394" cy="286" r="44" fill="white" opacity="0.14" />
      <rect x="126" y="76" width="228" height="208" rx="34" fill="rgba(255,255,255,0.12)" />
      <circle cx="240" cy="150" r="50" fill="rgba(255,255,255,0.2)" />
      <rect x="168" y="212" width="144" height="26" rx="13" fill="rgba(255,255,255,0.18)" />
      <text
        x="240"
        y="162"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="white"
        font-family="Inter, Arial, sans-serif"
        font-size="58"
        font-weight="700"
        letter-spacing="5"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(landscapeSvg)}`;
}
