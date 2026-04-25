import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Gauge,
  Handshake,
  Lock,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  Search,
  Target,
  TrendingUp,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  VOICE_COACH_SCENARIO_LABELS,
  type VoiceCoachScenario,
  type VoiceCoachSession,
  type VoiceCoachTranscriptTurn
} from "@kalitedb/shared";
import { PageHeader, SurfaceCard } from "@kalitedb/ui";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type ScenarioMeta = {
  key: VoiceCoachScenario;
  label: string;
  description: string;
  icon: typeof Gauge;
  difficulty: "Kolay" | "Orta" | "Zor";
  accent: {
    chip: string;
    gradient: string;
    ring: string;
    glow: string;
    icon: string;
  };
};

const SCENARIOS: ScenarioMeta[] = [
  {
    key: "competitor_compare",
    label: VOICE_COACH_SCENARIO_LABELS.competitor_compare,
    description: "Ticimax/Shopify ile karşılaştırma yapan analitik müşteriye somut argüman üret.",
    icon: Target,
    difficulty: "Zor",
    accent: {
      chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
      gradient: "from-rose-500/20 via-orange-400/10 to-transparent",
      ring: "ring-rose-200 dark:ring-rose-900/50",
      glow: "shadow-[0_28px_80px_rgba(244,63,94,0.16)]",
      icon: "bg-rose-500 text-white"
    }
  },
  {
    key: "price_roi",
    label: VOICE_COACH_SCENARIO_LABELS.price_roi,
    description: "Fiyat, gizli maliyet ve ROI sorularına karşı net rakamlarla cevap ver.",
    icon: Gauge,
    difficulty: "Zor",
    accent: {
      chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
      gradient: "from-amber-500/20 via-yellow-400/10 to-transparent",
      ring: "ring-amber-200 dark:ring-amber-900/50",
      glow: "shadow-[0_28px_80px_rgba(245,158,11,0.16)]",
      icon: "bg-amber-500 text-white"
    }
  },
  {
    key: "technical",
    label: VOICE_COACH_SCENARIO_LABELS.technical,
    description: "API, entegrasyon ve ölçeklenebilirlik soran teknik müşteriyi yönet.",
    icon: Search,
    difficulty: "Zor",
    accent: {
      chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
      gradient: "from-indigo-500/20 via-sky-400/10 to-transparent",
      ring: "ring-indigo-200 dark:ring-indigo-900/50",
      glow: "shadow-[0_28px_80px_rgba(99,102,241,0.16)]",
      icon: "bg-indigo-500 text-white"
    }
  },
  {
    key: "hesitant",
    label: VOICE_COACH_SCENARIO_LABELS.hesitant,
    description: "Karar veremeyen, çekingen müşteriyi empatiyle yönlendir ve harekete geçir.",
    icon: Handshake,
    difficulty: "Orta",
    accent: {
      chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
      gradient: "from-emerald-500/20 via-teal-400/10 to-transparent",
      ring: "ring-emerald-200 dark:ring-emerald-900/50",
      glow: "shadow-[0_28px_80px_rgba(16,185,129,0.16)]",
      icon: "bg-emerald-500 text-white"
    }
  }
];

const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map((s) => [s.key, s])) as Record<VoiceCoachScenario, ScenarioMeta>;

function formatDuration(sec: number | undefined) {
  if (sec === undefined || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "az önce";
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} sa önce`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} gün önce`;
    return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function scoreTone(score: number) {
  if (score >= 80) return {
    stroke: "stroke-emerald-500",
    bg: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-200 dark:ring-emerald-900/50"
  };
  if (score >= 60) return {
    stroke: "stroke-amber-500",
    bg: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-200 dark:ring-amber-900/50"
  };
  return {
    stroke: "stroke-rose-500",
    bg: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-200 dark:ring-rose-900/50"
  };
}

function RadialScore({ value, size = 96, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
  const tone = scoreTone(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="-rotate-90" height={size} width={size}>
        <circle
          className="stroke-slate-200 dark:stroke-slate-800"
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className={`${tone.stroke} transition-all duration-700`}
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-2xl font-semibold tabular-nums ${tone.text}`}>{Math.round(value)}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">/100</span>
      </div>
    </div>
  );
}

function Waveform({ getBytes, active, variant }: { getBytes: () => Uint8Array; active: boolean; variant: "listening" | "speaking" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, w, h);
      let data: Uint8Array;
      try {
        data = getBytes();
      } catch {
        data = new Uint8Array(0);
      }
      const bars = 48;
      const step = Math.max(1, Math.floor(data.length / bars));
      const barWidth = w / bars;
      const color = variant === "speaking"
        ? "rgba(16, 185, 129, 0.9)"
        : "rgba(59, 130, 246, 0.9)";
      const idleColor = "rgba(148, 163, 184, 0.35)";
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < step && i * step + j < data.length; j++) {
          sum += data[i * step + j] ?? 0;
        }
        const v = data.length ? sum / step / 255 : 0;
        const amp = active ? Math.max(0.05, v) : 0.05;
        const barHeight = Math.max(3, amp * h * 0.9);
        const x = i * barWidth + barWidth * 0.15;
        const bw = barWidth * 0.7;
        const y = (h - barHeight) / 2;
        ctx.fillStyle = active && v > 0.05 ? color : idleColor;
        ctx.beginPath();
        const r = Math.min(bw / 2, 3);
        ctx.roundRect(x, y, bw, barHeight, r);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [getBytes, active, variant]);
  return <canvas className="h-20 w-full" ref={canvasRef} />;
}

type RoleplayActiveState = {
  sessionId: string;
  scenario: VoiceCoachScenario;
  startedAt: number;
};

function RoleplayStudio() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<RoleplayActiveState | null>(null);
  const [pendingScenario, setPendingScenario] = useState<VoiceCoachScenario | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const transcriptRef = useRef<VoiceCoachTranscriptTurn[]>([]);
  const conversationIdRef = useRef<string | undefined>(undefined);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      conversationIdRef.current = conversationId;
      setErrorMessage(null);
    },
    onDisconnect: () => {
      if (active) {
        void finalizeMutation.mutateAsync({ status: "completed" });
      }
    },
    onMessage: (msg: { source: string; message: string }) => {
      const role: VoiceCoachTranscriptTurn["role"] = msg.source === "user" ? "user" : "agent";
      transcriptRef.current = [
        ...transcriptRef.current,
        { role, text: msg.message, timestampMs: Date.now() - (active?.startedAt ?? Date.now()) }
      ];
      setTick((t) => t + 1);
    },
    onError: (err) => {
      const message = typeof err === "string" ? err : (err as Error | undefined)?.message ?? "Ses oturumunda hata oluştu.";
      setErrorMessage(message);
    }
  });

  const startMutation = useMutation({
    mutationFn: async (scenario: VoiceCoachScenario) => {
      setPendingScenario(scenario);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await api.requestVoiceCoachSignedUrl(auth.token, scenario);
      transcriptRef.current = [];
      conversationIdRef.current = undefined;
      conversation.startSession({
        signedUrl: res.signedUrl,
        dynamicVariables: res.dynamicVariables
      });
      return { scenario, sessionId: res.sessionId };
    },
    onSuccess: ({ scenario, sessionId }) => {
      setActive({ sessionId, scenario, startedAt: Date.now() });
      setPendingScenario(null);
    },
    onError: (err: unknown) => {
      setPendingScenario(null);
      setErrorMessage(err instanceof Error ? err.message : "Oturum başlatılamadı.");
    }
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ status }: { status: "completed" | "failed" }) => {
      if (!active) return null;
      const durationSec = Math.round((Date.now() - active.startedAt) / 1000);
      return api.finalizeVoiceCoachSession(auth.token, active.sessionId, {
        transcript: transcriptRef.current,
        ...(conversationIdRef.current ? { elevenlabsConversationId: conversationIdRef.current } : {}),
        durationSec,
        status
      });
    },
    onSettled: () => {
      setActive(null);
      void queryClient.invalidateQueries({ queryKey: ["voice-coach-sessions"] });
    }
  });

  const stop = () => {
    conversation.endSession();
  };

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [active]);

  const sessionsQuery = useQuery({
    queryKey: ["voice-coach-sessions", auth.token],
    queryFn: () => api.listVoiceCoachSessions(auth.token, { limit: 50 }),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000
  });

  const entitlementQuery = useQuery({
    queryKey: ["voice-coach-entitlement", auth.token],
    queryFn: () => api.getVoiceCoachEntitlement(auth.token),
    staleTime: 60 * 1000,
    enabled: Boolean(auth.token)
  });
  const canStart = entitlementQuery.data?.allowed ?? false;
  const gateReason = entitlementQuery.data?.reason;

  const sessions = sessionsQuery.data ?? [];
  const selectedSession = useMemo(
    () => sessions.find((s) => s.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === "completed");
    const totalSec = completed.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
    const scored = completed.filter((s) => s.coaching?.overallScore !== undefined);
    const avg = scored.length
      ? scored.reduce((sum, s) => sum + (s.coaching?.overallScore ?? 0), 0) / scored.length
      : 0;
    return { count: completed.length, totalSec, avg };
  }, [sessions]);

  const elapsedSec = active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0;
  const activeMeta = active ? SCENARIO_MAP[active.scenario] : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Satış"
        title="Rol-Play Koçu"
        subtitle="Bir senaryo seç, AI müşteri ile sesli rol-play yap. Bitince transkript, ses kaydı ve koçluk geri bildirimi kaydedilir."
        metaChips={
          sessions.length ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                <Zap size={12} strokeWidth={2} /> {stats.count} oturum
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                <Clock size={12} strokeWidth={2} /> {formatDuration(stats.totalSec)} toplam
              </span>
              {stats.avg > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                  <TrendingUp size={12} strokeWidth={2} /> {Math.round(stats.avg)}/100 ortalama
                </span>
              ) : null}
            </>
          ) : undefined
        }
      />

      {errorMessage ? (
        <div className="rounded-[10px] border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      {active && activeMeta ? (
        <ActiveSessionPanel
          conversation={conversation}
          elapsedSec={elapsedSec}
          meta={activeMeta}
          onStop={stop}
          transcript={transcriptRef.current}
        />
      ) : (
        <SurfaceCard title="Senaryo seç" description="Hangi satış durumunu pratik etmek istiyorsun?">
          {!entitlementQuery.isPending && !canStart ? (
            <div className="mb-4 flex items-start gap-3 rounded-[10px] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <Lock className="mt-0.5 shrink-0" size={16} strokeWidth={2} />
              <p>{gateReason ?? "Ses kredisi sınırlı olduğu için görüşme başlatma şu an kapalı."}</p>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {SCENARIOS.map((s) => {
              const Icon = s.icon;
              const isPending = pendingScenario === s.key && startMutation.isPending;
              const disabled = startMutation.isPending || !canStart;
              return (
                <button
                  className={`group relative overflow-hidden rounded-[14px] border border-slate-200 bg-white p-0 text-left transition duration-300 hover:-translate-y-1 hover:border-transparent hover:${s.accent.glow} disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 dark:border-slate-700 dark:bg-slate-900`}
                  disabled={disabled}
                  key={s.key}
                  onClick={() => startMutation.mutate(s.key)}
                  type="button"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br opacity-0 transition duration-300 group-hover:opacity-100 ${s.accent.gradient}`} />
                  <div className="relative grid gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex size-11 items-center justify-center rounded-[12px] ${s.accent.icon} shadow-[0_12px_28px_rgba(15,23,42,0.18)]`}>
                        <Icon size={20} strokeWidth={1.9} />
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${s.accent.chip}`}>
                        {s.difficulty}
                      </span>
                    </div>
                    <div>
                      <p className="font-display text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">{s.label}</p>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-400">{s.description}</p>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">~3-4 dk</span>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 transition group-hover:translate-x-0.5 dark:text-slate-100">
                        {!canStart ? (
                          <><Lock size={12} strokeWidth={2} /> Kilitli</>
                        ) : isPending ? "Başlatılıyor…" : (
                          <>Başlat <Play fill="currentColor" size={12} strokeWidth={0} /></>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard title="Geçmiş oturumlar" description="Kendi oturumların ve — yöneticiysen — ekibinki.">
        {sessionsQuery.isPending ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : !sessions.length ? (
          <p className="text-sm text-slate-500">Henüz oturum yok. Yukarıdan bir senaryo seçerek başla.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => (
              <SessionCard
                isSelected={s.sessionId === selectedSessionId}
                key={s.sessionId}
                onSelect={() => setSelectedSessionId(s.sessionId === selectedSessionId ? null : s.sessionId)}
                session={s}
              />
            ))}
          </div>
        )}
      </SurfaceCard>

      {selectedSession ? <DetailPanel session={selectedSession} /> : null}
    </div>
  );
}

function ActiveSessionPanel({
  conversation,
  elapsedSec,
  meta,
  onStop,
  transcript
}: {
  conversation: ReturnType<typeof useConversation>;
  elapsedSec: number;
  meta: ScenarioMeta;
  onStop: () => void;
  transcript: VoiceCoachTranscriptTurn[];
}) {
  const Icon = meta.icon;
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length]);

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;
  const variant: "speaking" | "listening" = isSpeaking ? "speaking" : "listening";

  return (
    <div className={`relative overflow-hidden rounded-[14px] border border-slate-200 bg-slate-950 text-white ${meta.accent.glow} dark:border-slate-800`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${meta.accent.gradient} opacity-60`} />
      <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
      <div className={`absolute -right-16 -bottom-16 h-64 w-64 rounded-full ${isSpeaking ? "bg-emerald-500/30" : "bg-sky-500/20"} blur-3xl transition duration-700`} />

      <div className="relative grid gap-6 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-[12px] ${meta.accent.icon}`}>
              <Icon size={20} strokeWidth={1.9} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">Canlı oturum</p>
              <p className="font-display text-xl font-semibold tracking-[-0.02em]">{meta.label}</p>
            </div>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-rose-500 px-5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(244,63,94,0.35)] transition hover:bg-rose-600"
            onClick={onStop}
            type="button"
          >
            <PhoneOff size={14} strokeWidth={2} /> Görüşmeyi bitir
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col items-center gap-5 rounded-[12px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="relative flex size-40 items-center justify-center">
              <span
                className={`absolute inset-0 rounded-full ${
                  isSpeaking ? "bg-emerald-400/25" : "bg-sky-400/20"
                } ${isConnected ? "animate-ping" : ""}`}
              />
              <span
                className={`absolute inset-3 rounded-full ${
                  isSpeaking ? "bg-emerald-400/30" : "bg-sky-400/25"
                } ${isConnected ? "animate-pulse" : ""}`}
              />
              <div
                className={`relative flex size-28 items-center justify-center rounded-full ${
                  isSpeaking
                    ? "bg-emerald-500 text-white"
                    : isConnected
                      ? "bg-sky-500 text-white"
                      : "bg-slate-700 text-slate-300"
                } shadow-[0_24px_60px_rgba(15,23,42,0.35)] transition duration-300`}
              >
                {conversation.isMuted ? <MicOff size={40} strokeWidth={1.6} /> : <Mic size={40} strokeWidth={1.6} />}
              </div>
            </div>

            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                {isConnected ? (isSpeaking ? "Ajan konuşuyor" : "Dinleniyor") : conversation.status === "connecting" ? "Bağlanılıyor" : "Bağlantı yok"}
              </p>
              <p className="mt-2 font-display text-4xl font-semibold tabular-nums tracking-[-0.04em]">{formatDuration(elapsedSec)}</p>
            </div>

            <Waveform
              active={isConnected}
              getBytes={variant === "speaking" ? conversation.getOutputByteFrequencyData : conversation.getInputByteFrequencyData}
              variant={variant}
            />

            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              onClick={() => conversation.setMuted(!conversation.isMuted)}
              type="button"
            >
              {conversation.isMuted ? <Mic size={12} /> : <MicOff size={12} />}
              {conversation.isMuted ? "Sesi aç" : "Sesi kapat"}
            </button>
          </div>

          <div className="flex flex-col rounded-[12px] border border-white/10 bg-slate-900/50 p-5 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">Canlı transkript</p>
              <p className="text-[11px] text-white/40">{transcript.length} mesaj</p>
            </div>
            <div className="max-h-[420px] min-h-[240px] overflow-y-auto pr-1" ref={transcriptRef}>
              {transcript.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <Mic className="text-white/30" size={28} strokeWidth={1.5} />
                  <p className="text-sm text-white/50">Konuşmaya başla — transkript burada akacak.</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {transcript.map((turn, idx) => (
                    <div
                      className={`rounded-[10px] border px-3 py-2 text-sm ${
                        turn.role === "agent"
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-50"
                          : "border-white/15 bg-white/5 text-white/90"
                      }`}
                      key={idx}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                        {turn.role === "agent" ? "Ajan" : "Sen"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{turn.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionCard({
  isSelected,
  onSelect,
  session
}: {
  isSelected: boolean;
  onSelect: () => void;
  session: VoiceCoachSession;
}) {
  const meta = SCENARIO_MAP[session.scenario];
  const Icon = meta.icon;
  const score = session.coaching?.overallScore;
  const statusLabel = session.status === "completed" ? "Tamamlandı" : session.status === "failed" ? "Hata" : "Sürüyor";
  const statusChip = session.status === "completed"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
    : session.status === "failed"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
      : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";

  return (
    <button
      className={`group relative overflow-hidden rounded-[14px] border bg-white p-0 text-left transition duration-300 hover:-translate-y-0.5 dark:bg-slate-900 ${
        isSelected
          ? "border-sky-400 shadow-[0_18px_40px_rgba(14,165,233,0.18)] dark:border-sky-500"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className={`absolute inset-0 bg-gradient-to-br opacity-0 transition duration-300 group-hover:opacity-100 ${meta.accent.gradient}`} />
      <div className="relative grid gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] ${meta.accent.icon}`}>
              <Icon size={18} strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold text-slate-950 dark:text-slate-100">{meta.label}</p>
              <p className="truncate text-xs text-slate-500">
                {session.repName} • {formatRelative(session.startedAt)}
              </p>
            </div>
          </div>
          {score !== undefined ? (
            <RadialScore size={56} strokeWidth={5} value={score} />
          ) : (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusChip}`}>
              {statusLabel}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} strokeWidth={2} /> {formatDuration(session.durationSec)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {session.transcript.length} mesaj
          </span>
          {session.audioUrl ? (
            <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
              <Play fill="currentColor" size={10} strokeWidth={0} /> ses var
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function DetailPanel({ session }: { session: VoiceCoachSession }) {
  const meta = SCENARIO_MAP[session.scenario];
  const Icon = meta.icon;
  const coaching = session.coaching;

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className={`relative overflow-hidden border-b border-slate-200 p-6 dark:border-slate-700`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${meta.accent.gradient}`} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-[12px] ${meta.accent.icon}`}>
              <Icon size={20} strokeWidth={1.9} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Oturum detayı</p>
              <p className="font-display text-xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">{meta.label}</p>
              <p className="text-xs text-slate-500">
                {session.repName} • {formatDateTime(session.startedAt)} • {formatDuration(session.durationSec)}
              </p>
            </div>
          </div>
          {coaching ? <RadialScore size={96} strokeWidth={8} value={coaching.overallScore} /> : null}
        </div>
      </div>

      {session.audioUrl ? (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Ses kaydı</span>
            <audio className="flex-1" controls preload="none" src={session.audioUrl} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Transkript</p>
          <div className="max-h-[520px] overflow-y-auto rounded-[12px] border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            {session.transcript.length === 0 ? (
              <p className="text-sm text-slate-500">Transkript yok.</p>
            ) : (
              <div className="grid gap-2">
                {session.transcript.map((turn, idx) => (
                  <div
                    className={`rounded-[10px] border px-3 py-2 text-sm ${
                      turn.role === "agent"
                        ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"
                        : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    }`}
                    key={idx}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      {turn.role === "agent" ? "Ajan" : session.repName}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{turn.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Koçluk geri bildirimi</p>
          {coaching ? (
            <>
              {coaching.summary ? (
                <div className="rounded-[12px] border border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                  {coaching.summary}
                </div>
              ) : null}

              {coaching.strengths.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">Güçlü yönler</p>
                  <div className="flex flex-wrap gap-2">
                    {coaching.strengths.map((s, i) => (
                      <span
                        className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                        key={i}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {coaching.improvements.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">Gelişim alanları</p>
                  <div className="flex flex-wrap gap-2">
                    {coaching.improvements.map((s, i) => (
                      <span
                        className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                        key={i}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {coaching.keyMoments.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Anahtar anlar</p>
                  <ul className="grid gap-2 text-sm text-slate-700 dark:text-slate-300">
                    {coaching.keyMoments.map((m, i) => (
                      <li className="flex gap-3 rounded-[10px] border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" key={i}>
                        <span className="shrink-0 font-mono text-xs text-slate-500">{formatDuration(Math.floor(m.timestampMs / 1000))}</span>
                        <span>{m.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-[12px] border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
              Koçluk verisi henüz üretilmemiş. ElevenLabs agent'ında "evaluation criteria" tanımlıysa oturum bitince otomatik gelecek.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SalesRoleplayPage() {
  return (
    <ConversationProvider>
      <RoleplayStudio />
    </ConversationProvider>
  );
}
