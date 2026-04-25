import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Plus, RefreshCw, Trash2, X, AlertCircle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ROLEPLAY_KNOWLEDGE_CATEGORY_LABELS,
  type RoleplayKnowledgeDoc,
  type RoleplayKnowledgeDocInput
} from "@kalitedb/shared";
import { SurfaceCard } from "@kalitedb/ui";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

const EMPTY_FORM: RoleplayKnowledgeDocInput = {
  title: "",
  category: "product",
  body: "",
  active: true
};

export function RoleplayKnowledgeAdmin() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RoleplayKnowledgeDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const docsQuery = useQuery({
    queryKey: ["roleplay-knowledge-docs", auth.token],
    queryFn: () => api.listRoleplayKnowledgeDocs(auth.token),
    enabled: Boolean(auth.token)
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["roleplay-knowledge-docs"] });

  const createMutation = useMutation({
    mutationFn: (input: RoleplayKnowledgeDocInput) => api.createRoleplayKnowledgeDoc(auth.token, input),
    onSuccess: () => {
      void invalidate();
      setCreating(false);
      setErrorMessage(null);
    },
    onError: (err: unknown) =>
      setErrorMessage(err instanceof Error ? err.message : "Kayıt başarısız.")
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RoleplayKnowledgeDocInput> }) =>
      api.updateRoleplayKnowledgeDoc(auth.token, id, patch),
    onSuccess: () => {
      void invalidate();
      setEditing(null);
      setErrorMessage(null);
    },
    onError: (err: unknown) =>
      setErrorMessage(err instanceof Error ? err.message : "Güncelleme başarısız.")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRoleplayKnowledgeDoc(auth.token, id),
    onSuccess: invalidate
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.syncRoleplayKnowledgeDoc(auth.token, id),
    onSuccess: invalidate
  });

  const docs = docsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <SurfaceCard
        title="ikas Bilgi Bankası"
        description="Buradaki dokümanlar ElevenLabs ajanının knowledge base'ine sync edilir. Aktif dokümanlar tüm role-play oturumlarında ajan tarafından referans alınır."
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-slate-500">{docs.length} doküman</p>
          <button
            className="inline-flex items-center gap-2 rounded-[10px] bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Plus size={14} /> Yeni doküman
          </button>
        </div>

        {errorMessage ? (
          <div className="mb-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        {docsQuery.isPending ? (
          <p className="text-sm text-slate-500">Yükleniyor…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Henüz doküman yok. ikas hakkında bilgileri (ürün özetleri, fiyatlandırma, vakalar)
            "Yeni doküman" ile ekleyebilirsin.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Başlık</th>
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Sync</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2 text-right">Eylemler</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr className="border-t border-slate-100" key={d.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{d.title}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {ROLEPLAY_KNOWLEDGE_CATEGORY_LABELS[d.category]}
                    </td>
                    <td className="px-3 py-2">
                      <SyncBadge doc={d} />
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          d.active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {d.active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-[8px] border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          disabled={syncMutation.isPending}
                          onClick={() => syncMutation.mutate(d.id)}
                          title="ElevenLabs ile yeniden senkronize et"
                          type="button"
                        >
                          <RefreshCw size={12} /> Sync
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-[8px] border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => setEditing(d)}
                          type="button"
                        >
                          <Pencil size={12} /> Düzenle
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-[8px] border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`"${d.title}" dokümanını silmek istediğine emin misin?`)) {
                              deleteMutation.mutate(d.id);
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
        <KnowledgeFormModal
          initial={EMPTY_FORM}
          isSubmitting={createMutation.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(input) => createMutation.mutate(input)}
          title="Yeni doküman"
        />
      ) : null}

      {editing ? (
        <KnowledgeFormModal
          initial={{
            title: editing.title,
            category: editing.category,
            body: editing.body,
            active: editing.active
          }}
          isSubmitting={updateMutation.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(input) => updateMutation.mutate({ id: editing.id, patch: input })}
          title={`Düzenle: ${editing.title}`}
        />
      ) : null}
    </div>
  );
}

function SyncBadge({ doc }: { doc: RoleplayKnowledgeDoc }) {
  if (doc.syncStatus === "synced") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 size={12} /> Senkronize
      </span>
    );
  }
  if (doc.syncStatus === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
        title={doc.syncError ?? "Sync hatası"}
      >
        <AlertCircle size={12} /> Hata
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <Clock size={12} /> Beklemede
    </span>
  );
}

function KnowledgeFormModal({
  initial,
  isSubmitting,
  onClose,
  onSubmit,
  title
}: {
  initial: RoleplayKnowledgeDocInput;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: RoleplayKnowledgeDocInput) => void;
  title: string;
}) {
  const [form, setForm] = useState<RoleplayKnowledgeDocInput>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const update = (patch: Partial<RoleplayKnowledgeDocInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

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
            onSubmit(form);
          }}
        >
          <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto]">
            <Field label="Başlık">
              <input
                className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
                onChange={(e) => update({ title: e.target.value })}
                required
                value={form.title}
              />
            </Field>
            <Field label="Kategori">
              <select
                className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm"
                onChange={(e) =>
                  update({ category: e.target.value as RoleplayKnowledgeDocInput["category"] })
                }
                value={form.category}
              >
                {Object.entries(ROLEPLAY_KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Aktif">
              <label className="flex h-full items-center gap-2 text-sm">
                <input
                  checked={form.active ?? true}
                  onChange={(e) => update({ active: e.target.checked })}
                  type="checkbox"
                />
                <span>{form.active ?? true ? "Sync edilecek" : "Sync dışı"}</span>
              </label>
            </Field>
          </div>

          <Field label="İçerik (markdown desteklenir; ajan referans olarak kullanır)">
            <textarea
              className="w-full rounded-[10px] border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
              onChange={(e) => update({ body: e.target.value })}
              required
              rows={18}
              value={form.body}
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
              {isSubmitting ? "Kaydediliyor…" : "Kaydet & Sync"}
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
