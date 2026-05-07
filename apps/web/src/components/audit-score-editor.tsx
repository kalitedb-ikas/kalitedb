import type { AuditMetric, Representative } from "@kalitedb/shared";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { RepresentativeSelect } from "./representative-select";

type Mode = "create" | "edit";

export type AuditScoreDraft = {
  agentKey: string;
  agentName: string;
  auditScore: number | null;
  previousAuditAccuracy: number | null;
};

export function AuditScoreEditorModal(props: {
  mode: Mode;
  periodMonth: string;
  periodTitle?: string | undefined;
  initial?: AuditMetric | undefined;
  representatives: Representative[];
  existingAgentKeys: Set<string>;
  onClose: () => void;
  onSave: (draft: AuditScoreDraft) => Promise<void>;
  isSaving: boolean;
  errorMessage?: string | null | undefined;
}) {
  const isEdit = props.mode === "edit";

  const [agentKey, setAgentKey] = useState<string>(props.initial?.agentKey ?? "");
  const [auditScoreRaw, setAuditScoreRaw] = useState<string>(
    props.initial?.auditScore != null ? String(props.initial.auditScore) : ""
  );
  const [previousAuditAccuracyRaw, setPreviousAuditAccuracyRaw] = useState<string>(
    props.initial?.previousAuditAccuracy != null ? String(props.initial.previousAuditAccuracy) : ""
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setAgentKey(props.initial?.agentKey ?? "");
    setAuditScoreRaw(props.initial?.auditScore != null ? String(props.initial.auditScore) : "");
    setPreviousAuditAccuracyRaw(
      props.initial?.previousAuditAccuracy != null ? String(props.initial.previousAuditAccuracy) : ""
    );
    setValidationError(null);
  }, [props.initial]);

  const repOptions = useMemo(() => {
    const sorted = [...props.representatives]
      .filter((rep) => rep.status === "active")
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "tr"));
    if (!isEdit) {
      return sorted
        .filter((rep) => !props.existingAgentKeys.has(rep.key))
        .map((rep) => ({ key: rep.key, label: rep.displayName }));
    }
    return sorted.map((rep) => ({ key: rep.key, label: rep.displayName }));
  }, [props.representatives, props.existingAgentKeys, isEdit]);

  const selectedRep = useMemo(
    () => props.representatives.find((rep) => rep.key === agentKey),
    [props.representatives, agentKey]
  );

  function parseScore(raw: string, label: string): number | null | string {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const normalized = trimmed.replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value)) return `${label} sayısal bir değer olmalı.`;
    if (value < 0 || value > 100) return `${label} 0-100 aralığında olmalı.`;
    return Number(value.toFixed(2));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    if (!agentKey) {
      setValidationError("Temsilci seçilmelidir.");
      return;
    }

    const audit = parseScore(auditScoreRaw, "Audit skoru");
    if (typeof audit === "string") {
      setValidationError(audit);
      return;
    }
    const previous = parseScore(previousAuditAccuracyRaw, "Önceki audit doğruluğu");
    if (typeof previous === "string") {
      setValidationError(previous);
      return;
    }

    const agentName = selectedRep?.displayName ?? props.initial?.agentName ?? agentKey;

    await props.onSave({
      agentKey,
      agentName,
      auditScore: audit,
      previousAuditAccuracy: previous
    });
  }

  const errorMessage = validationError ?? props.errorMessage ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Kapat"
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          onClick={props.onClose}
          type="button"
        >
          <X size={18} />
        </button>

        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {isEdit ? "Audit skoru düzenle" : "Manuel audit skoru ekle"}
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
            {props.periodTitle ?? props.periodMonth}
          </h3>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Temsilci</label>
            {isEdit ? (
              <input
                className="cursor-not-allowed rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200"
                disabled
                value={selectedRep?.displayName ?? props.initial?.agentName ?? ""}
              />
            ) : (
              <RepresentativeSelect
                onChange={setAgentKey}
                options={repOptions}
                placeholder="Temsilci seçin"
                value={agentKey}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Audit skoru (0-100)</span>
              <input
                className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200"
                inputMode="decimal"
                onChange={(e) => setAuditScoreRaw(e.target.value)}
                placeholder="örn. 87.5"
                value={auditScoreRaw}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Önceki audit doğruluğu (%)</span>
              <input
                className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200"
                inputMode="decimal"
                onChange={(e) => setPreviousAuditAccuracyRaw(e.target.value)}
                placeholder="örn. 92.3"
                value={previousAuditAccuracyRaw}
              />
            </label>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Boş bırakılan alanlar kayıtta "boş" olarak saklanır ve ortalama hesaplarına dahil edilmez.
          </p>

          {errorMessage ? (
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-200"
              onClick={props.onClose}
              type="button"
              disabled={props.isSaving}
            >
              İptal
            </button>
            <button
              className="rounded-[10px] bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={props.isSaving}
            >
              {props.isSaving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Skor Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
