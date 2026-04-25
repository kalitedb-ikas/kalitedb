import type { RoleplayKnowledgeDoc } from "@kalitedb/shared";

import { getAgentId } from "./elevenlabs";
import { ApiError } from "./responses";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, "ELEVENLABS_API_KEY tanımlı değil.");
  }
  return apiKey;
}

async function elevenlabsFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("xi-api-key", getApiKey());
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${ELEVENLABS_BASE_URL}${path}`, { ...init, headers });
}

function formatBody(doc: Pick<RoleplayKnowledgeDoc, "title" | "category" | "body">): string {
  return `# ${doc.title}\n\nKategori: ${doc.category}\n\n${doc.body.trim()}\n`;
}

export type KnowledgeBaseEntry = {
  id: string;
  name: string;
  usageMode: "auto" | "prompt";
};

export async function createKnowledgeDocFromText(
  doc: Pick<RoleplayKnowledgeDoc, "title" | "category" | "body">
): Promise<{ documentationId: string }> {
  const response = await elevenlabsFetch("/v1/convai/knowledge-base/text", {
    method: "POST",
    body: JSON.stringify({
      name: doc.title.slice(0, 120),
      text: formatBody(doc)
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(502, `ElevenLabs KB oluşturma hatası: ${response.status} ${text.slice(0, 200)}`);
  }
  const json = (await response.json()) as { id?: string; documentation_id?: string };
  const id = json.id ?? json.documentation_id;
  if (!id) {
    throw new ApiError(502, "ElevenLabs KB cevabında doküman id bulunamadı.");
  }
  return { documentationId: id };
}

export async function deleteKnowledgeDocById(documentationId: string): Promise<void> {
  const response = await elevenlabsFetch(
    `/v1/convai/knowledge-base/${encodeURIComponent(documentationId)}?force=true`,
    { method: "DELETE" }
  );
  // 404 durumunda sessizce geç — doc zaten yoksa silinmiş kabul edilir.
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new ApiError(502, `ElevenLabs KB silme hatası: ${response.status} ${text.slice(0, 200)}`);
  }
}

export type UpsertResult = { documentationId: string; replaced: boolean };

/**
 * KB doc'unu ElevenLabs'a yazar. Mevcut bir id varsa: önce silip yenisini oluşturur
 * (text içeriği güncelleyen update endpoint'i SDK'da/API'de henüz yok — name dışında
 * içerik immutable). Çağıran taraf yeni id'yi Firestore'a yazmakla sorumludur.
 */
export async function upsertKnowledgeDoc(
  doc: Pick<RoleplayKnowledgeDoc, "title" | "category" | "body" | "elevenlabsDocId">
): Promise<UpsertResult> {
  if (doc.elevenlabsDocId) {
    await deleteKnowledgeDocById(doc.elevenlabsDocId);
    const created = await createKnowledgeDocFromText(doc);
    return { documentationId: created.documentationId, replaced: true };
  }
  const created = await createKnowledgeDocFromText(doc);
  return { documentationId: created.documentationId, replaced: false };
}

/**
 * Verilen aktif KB doküman listesini agent'ın `knowledge_base` alanına yazar.
 * PATCH /v1/convai/agents/{agentId} ile conversation_config içine gömerek.
 */
export async function syncAgentKnowledgeBase(entries: KnowledgeBaseEntry[]): Promise<void> {
  const agentId = getAgentId();
  const body = {
    conversation_config: {
      agent: {
        prompt: {
          knowledge_base: entries.map((entry) => ({
            type: "file",
            id: entry.id,
            name: entry.name.slice(0, 120),
            usage_mode: entry.usageMode
          }))
        }
      }
    }
  };
  const response = await elevenlabsFetch(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      502,
      `ElevenLabs agent KB sync hatası: ${response.status} ${text.slice(0, 200)}`
    );
  }
}
