import { bearer } from "@/lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export type CreateSessionRequest = {
  target_languages: string[];
  glossary_preset_id?: string | null;
};

export type CreateSessionResponse = {
  session_id: string;
  operator_url: string;
  output_urls: Record<string, string>;
};

export type SessionCostBreakdown = {
  service: "stt" | "translate" | "tts" | "infra";
  units: number;
  unit_label: string;
  amount_jpy: number;
};

export type SessionCostSummary = {
  session_id: string;
  total_jpy: number;
  breakdown: SessionCostBreakdown[];
};

function authHeaders(): Record<string, string> {
  const t = bearer();
  return t ? { authorization: `Bearer ${t}` } : {};
}

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export function createSession(
  body: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  return jsonFetch<CreateSessionResponse>("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function endSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/end`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export function getSessionCost(sessionId: string): Promise<SessionCostSummary> {
  return jsonFetch<SessionCostSummary>(`/api/v1/sessions/${sessionId}/cost`);
}

// ---------- Glossary ----------

export type GlossaryEntry = {
  source_ja: string;
  translations: Record<string, string>;
  category: "company" | "product" | "person" | "term";
};

export type GlossaryPreset = {
  id: string;
  name: string;
  entries: GlossaryEntry[];
  updated_at: string | null;
};

export type GlossaryPresetCreate = {
  name: string;
  entries: GlossaryEntry[];
};

export function listGlossaries(): Promise<GlossaryPreset[]> {
  return jsonFetch<GlossaryPreset[]>("/api/v1/glossaries");
}

export function getGlossary(id: string): Promise<GlossaryPreset> {
  return jsonFetch<GlossaryPreset>(`/api/v1/glossaries/${id}`);
}

export function createGlossary(
  body: GlossaryPresetCreate,
): Promise<GlossaryPreset> {
  return jsonFetch<GlossaryPreset>("/api/v1/glossaries", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateGlossary(
  id: string,
  body: GlossaryPresetCreate,
): Promise<GlossaryPreset> {
  return jsonFetch<GlossaryPreset>(`/api/v1/glossaries/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteGlossary(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/glossaries/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}
