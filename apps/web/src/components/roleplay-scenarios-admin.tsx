import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type RoleplayScenario,
  type RoleplayScenarioInput
} from "@kalitedb/shared";
import { SurfaceCard } from "@kalitedb/ui";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePlan } from "../lib/plan";
import { LimitNotice } from "./plan";

const EMPTY_FORM: RoleplayScenarioInput = {
  slug: "",
  title: "",
  description: "",
  difficulty: "Orta",
  persona: "",
  opening: "",
  context: "",
  goals: [],
  active: true,
  sortOrder: 0
};

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ığüşöç]/g, (c) => ({ ı: "i", ğ: "g", ü: "u", ş: "s", ö: "o", ç: "c" }[c] ?? c))
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function RoleplayScenariosAdmin() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { isAtScenarioLimit, limits, usage } = usePlan();
  const [editing, setEditing] = useState<RoleplayScenario | null>(null);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scenariosQuery = useQuery({
    queryKey: ["roleplay-scenarios", auth.token],
    queryFn: () => api.listRoleplayScenarios(auth.token),
    enabled: Boolean(auth.token)
  });

  const createMutation = useMutation({
    mutationFn: (input: RoleplayScenarioInput) => api.createRoleplayScenario(auth.token, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roleplay-scenarios"] });
      setCreating(false);
      setErrorMessage(null);
    },
    onError: (err: unknown) =>
      setErrorMessage(err instanceof Error ? err.message : "Kayıt başarısız.")
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RoleplayScenarioInput> }) =>
      api.updateRoleplayScenario(auth.token, id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roleplay-scenarios"] });
      setEditing(null);
      setErrorMessage(null);
    },
    onError: (err: unknown) =>
      setErrorMessage(err instanceof Error ? err.message : "Güncelleme başarısız.")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRoleplayScenario(auth.token, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roleplay-scenarios"] });
    }
  });

  const scenarios = scenariosQuery.data ?? [];

  return (
    <div className="space-y-4">
      <SurfaceCard
        title="Role-Play Senaryoları"
        description="Temsilcilerin kullanacağı senaryoları yönet. Aktif olanlar /sales/roleplay sayfasında görünür."
      >
        <div className="mb-4 space-y-3">
          <LimitNotice resource="scenarios" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{scenarios.length} senaryo</p>
            <button
              className="inline-flex items-center gap-2 rounded-[10px] bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isAtScenarioLimit}
              onClick={() => setCreating(true)}
              title={
                isAtScenarioLimit && limits.scenarios !== null
                  ? `Plan limiti doldu (${usage.scenarioCount}/${limits.scenarios}) — yükselt.`
                  : undefined
              }
              type="button"
            >
              <Plus size={14} /> Yeni senaryo
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        {scenariosQuery.isPending ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : scenarios.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz senaryo yok. "Yeni senaryo" ile başla.</p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Başlık</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Zorluk</th>
                  <th className="px-3 py-2">Sıra</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2 text-right">Eylemler</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr className="border-t border-slate-100" key={s.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{s.title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{s.slug}</td>
                    <td className="px-3 py-2">{s.difficulty}</td>
                    <td className="px-3 py-2 text-slate-600">{s.sortOrder}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          s.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {s.active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-[8px] border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => setEditing(s)}
                          type="button"
                        >
                          <Pencil size={12} /> Düzenle
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-[8px] border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`"${s.title}" senaryosunu silmek istediğine emin misin?`)) {
                              deleteMutation.mutate(s.id);
                            }
                          }}
                          type="button"
                        >
                          <Trash2 size={12} /> Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      {creating ? (
        <ScenarioFormModal
          initial={EMPTY_FORM}
          isSubmitting={createMutation.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(input) => createMutation.mutate(input)}
          title="Yeni senaryo"
        />
      ) : null}

      {editing ? (
        <ScenarioFormModal
          initial={{
            slug: editing.slug,
            title: editing.title,
            description: editing.description,
            difficulty: editing.difficulty,
            persona: editing.persona,
            opening: editing.opening,
            context: editing.context ?? "",
            goals: editing.goals,
            active: editing.active,
            sortOrder: editing.sortOrder
          }}
          isSubmitting={updateMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(input) => updateMutation.mutate({ id: editing.id, patch: input })}
          slugLocked
          title={`Düzenle: ${editing.title}`}
        />
      ) : null}
    </div>
  );
}

function ScenarioFormModal({
  initial,
  isSubmitting,
  onClose,
  onSubmit,
  slugLocked,
  title
}: {
  initial: RoleplayScenarioInput;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: RoleplayScenarioInput) => void;
  slugLocked?: boolean;
  title: string;
}) {
  const [form, setForm] = useState<RoleplayScenarioInput>(initial);
  const [goalsText, setGoalsText] = useState((initial.goals ?? []).join("\n"));

  useEffect(() => {
    setForm(initial);
    setGoalsText((initial.goals ?? []).join("\n"));
  }, [initial]);

  const update = (patch: Partial<RoleplayScenarioInput>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[14px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-slate-900">{title}</h3>
          <button
            className="rounded-[8px] p-1 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form
          className="grid gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const goals = goalsText
              .split("\n")
              .map((g) => g.trim())
              .filter(Boolean);
            onSubmit({ ...form, goals, slug: form.slug.trim() });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Başlık">
              <input
                className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
                onChange={(e) => {
                  const newTitle = e.target.value;
                  update({
                    title: newTitle,
                    slug: slugLocked || form.slug ? form.slug : slugify(newTitle)
                  });
                }}
                required
                value={form.title}
              />
            </Field>
            <Field label="Slug (URL/key)">
              <input
                className="w-full rounded-[10px] border border-slate-200 px-3 py-2 font-mono text-sm disabled:bg-slate-50 disabled:text-slate-500"
                disabled={slugLocked}
                onChange={(e) => update({ slug: e.target.value })}
                pattern="^[a-z0-9][a-z0-9_-]*$"
                required
                value={form.slug}
              />
            </Field>
          </div>

          <Field label="Açıklama (kart üzerinde gözükür)">
            <textarea
              className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
              maxLength={500}
              onChange={(e) => update({ description: e.target.value })}
              required
              rows={2}
              value={form.description}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Zorluk">
              <select
                className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
                onChange={(e) => update({ difficulty: e.target.value as RoleplayScenarioInput["difficulty"] })}
                value={form.difficulty}
              >
                <option value="Kolay">Kolay</option>
                <option value="Orta">Orta</option>
                <option value="Zor">Zor</option>
              </select>
            </Field>
            <Field label="Sıralama (küçük = önce)">
              <input
                className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
                onChange={(e) => update({ sortOrder: Number(e.target.value) || 0 })}
                type="number"
                value={form.sortOrder ?? 0}
              />
            </Field>
            <Field label="Aktif">
              <label className="flex h-full items-center gap-2 text-sm">
                <input
                  checked={form.active ?? true}
                  onChange={(e) => update({ active: e.target.checked })}
                  type="checkbox"
                />
                <span>{form.active ?? true ? "Senaryo görünür" : "Pasif (gizli)"}</span>
              </label>
            </Field>
          </div>

          <Field label="Müşteri kişiliği / persona (system prompt'a gider)">
            <textarea
              className="w-full rounded-[10px] border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
              onChange={(e) => update({ persona: e.target.value })}
              required
              rows={12}
              value={form.persona}
            />
          </Field>

          <Field label="İlk müşteri repliği (opening)">
            <textarea
              className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
              onChange={(e) => update({ opening: e.target.value })}
              required
              rows={3}
              value={form.opening}
            />
          </Field>

          <Field label="Bağlam (opsiyonel — agent'a ek not)">
            <textarea
              className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
              onChange={(e) => update({ context: e.target.value })}
              rows={3}
              value={form.context ?? ""}
            />
          </Field>

          <Field label="Hedefler (her satıra bir hedef — temsilciye not olur, agent'a iletilmez)">
            <textarea
              className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
              onChange={(e) => setGoalsText(e.target.value)}
              rows={3}
              value={goalsText}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              className="rounded-[10px] border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              onClick={onClose}
              type="button"
            >
              Vazgeç
            </button>
            <button
              className="rounded-[10px] bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {children}
    </label>
  );
}
