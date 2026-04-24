import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { VoiceCoachScenario } from "@kalitedb/shared";

import { ApiError } from "./responses";

let cachedClient: ElevenLabsClient | undefined;

function getClient(): ElevenLabsClient {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      503,
      "ElevenLabs yapılandırılmamış. ELEVENLABS_API_KEY tanımlayın."
    );
  }
  cachedClient = new ElevenLabsClient({ apiKey });
  return cachedClient;
}

export function parseAllowedEmails(): string[] {
  const raw = process.env.ELEVENLABS_ALLOWED_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean);
}

export function canStartSession(user: { email: string; role: string }): { allowed: boolean; reason?: string } {
  const allowed = parseAllowedEmails();
  const normalized = user.email.trim().toLocaleLowerCase("tr-TR");
  if (allowed.length === 0) {
    if (user.role === "admin") return { allowed: true };
    return {
      allowed: false,
      reason: "Ses kredisi sınırlı — şu an yalnızca admin rolü görüşme başlatabilir."
    };
  }
  if (allowed.includes(normalized)) return { allowed: true };
  return {
    allowed: false,
    reason: "Ses kredisi sınırlı — hesabın şu an rol-play başlatma yetkisinde değil."
  };
}

export function getAgentId(): string {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) {
    throw new ApiError(503, "ELEVENLABS_AGENT_ID tanımlı değil.");
  }
  return agentId;
}

export const SCENARIO_BRIEFS: Record<VoiceCoachScenario, { persona: string; opening: string }> = {
  objection: {
    persona:
      "Sen ikas platformunu değerlendiren ama ciddi itirazları olan bir e-ticaret mağaza sahibisin. Fiyat, rakip (Shopify, Ideasoft, T-Soft), zaman ve entegrasyon konularında şüphecisin. Satış temsilcisini zorla, kolay ikna olma.",
    opening: "Açıkçası fiyat biraz yüksek geldi. Shopify'da da aynı özellikler var, neden sizi tercih edeyim?"
  },
  cold_call: {
    persona:
      "Sen meşgul, ilgisiz bir e-ticaret mağaza sahibisin. Satış temsilcisi seni tanımıyor, soğuk arama yapıyor. İlk başta kapatmak istiyorsun; ancak doğru değer önerisi duyarsan ilgilenebilirsin.",
    opening: "Efendim buyurun? Kimsiniz? Çok kısa konuşalım, toplantıdaydım."
  },
  discovery: {
    persona:
      "Sen ikas ile ilgilenen bir e-ticaret mağaza sahibisin. İhtiyaçlarını net anlatmıyorsun; satış temsilcisi doğru sorular sorarsa derinlemesine açıklayabilirsin. Satış ve operasyon tarafında gizli sorunlar var.",
    opening: "Evet, ikas hakkında biraz bilgi almak istiyordum. Ne anlatacaksınız?"
  },
  ikas_demo: {
    persona:
      "Sen ikas demosu izlemeye hazır, bilgili bir e-ticaret mağaza sahibisin. Satış temsilcisi ikas'ın özelliklerini anlatırken somut örnekler, entegrasyonlar, fiyatlama ve destek konularında akıllı sorular sor.",
    opening: "Tamam, ikas'ı gösterin. En çok hangi özelliği vurguluyorsunuz?"
  }
};

export async function createSignedUrl(): Promise<{ signedUrl: string; agentId: string }> {
  const agentId = getAgentId();
  const client = getClient();
  const response = await client.conversationalAi.conversations.getSignedUrl({ agentId });
  if (!response.signedUrl) {
    throw new ApiError(502, "ElevenLabs signed URL alınamadı.");
  }
  return { signedUrl: response.signedUrl, agentId };
}

export async function fetchConversationAnalysis(conversationId: string) {
  const client = getClient();
  const response = await client.conversationalAi.conversations.get(conversationId);
  return response as unknown;
}

export async function fetchConversationAudio(conversationId: string): Promise<Buffer> {
  const client = getClient();
  const stream = await client.conversationalAi.conversations.audio.get(conversationId);
  const chunks: Uint8Array[] = [];
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}
