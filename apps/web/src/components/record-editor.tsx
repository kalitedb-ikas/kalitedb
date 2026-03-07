import { useEffect, useState } from "react";
import { SectionCard } from "@kalitedb/ui";

type EditableRecord = Record<string, string | number | null | undefined>;

const READONLY_KEYS = new Set(["id", "period", "agentKey", "representativeKey"]);

export function RecordEditor(props: {
  title: string;
  record: EditableRecord | null;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!props.record) {
      setDraft({});
      return;
    }

    const nextDraft = Object.entries(props.record).reduce<Record<string, string>>((accumulator, [key, value]) => {
      if (!READONLY_KEYS.has(key)) {
        accumulator[key] = value === null || value === undefined ? "" : String(value);
      }
      return accumulator;
    }, {});

    setDraft(nextDraft);
  }, [props.record]);

  if (!props.record) {
    return (
      <SectionCard title={props.title} description="Düzenleme için tablodan bir kayıt seçin.">
        <p className="text-sm text-slate-500">Kayıt seçilmedi.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={props.title} description="Sayısal alanlar otomatik hesaplanan değerlerle yeniden doğrulanır.">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const updates = Object.entries(draft).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
            const originalValue = props.record?.[key];
            if (typeof originalValue === "number" || originalValue === null) {
              accumulator[key] = value.trim() === "" ? null : Number(value);
            } else {
              accumulator[key] = value;
            }
            return accumulator;
          }, {});

          void props.onSave(updates);
        }}
      >
        {Object.entries(draft).map(([key, value]) => (
          <label key={key} className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            {key}
            <input
              className="rounded-2xl border border-slate-200 px-3 py-2"
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  [key]: event.target.value
                }));
              }}
              value={value}
            />
          </label>
        ))}

        <div className="md:col-span-2">
          <button className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white" type="submit">
            Kaydı güncelle
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
