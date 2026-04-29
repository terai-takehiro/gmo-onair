import { bearer } from "@/lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export type CreateSessionRequest = {
  target_languages: string[];
  glossary_preset_id?: string | null;
  cc_ingest_urls?: Record<string, string> | null;
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

export type SessionPublic = {
  id: string;
  operator_user_id: string;
  target_languages: string[];
  glossary_preset_id: string | null;
  started_at: string;
  ended_at: string | null;
  status: "live" | "ended" | "aborted";
};

export function listSessions(): Promise<SessionPublic[]> {
  return jsonFetch<SessionPublic[]>("/api/v1/sessions");
}

export function getSession(id: string): Promise<SessionPublic> {
  return jsonFetch<SessionPublic>(`/api/v1/sessions/${id}`);
}

// ---------- Admin ----------

export type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "operator";
  is_active: boolean;
};

export type AdminUserCreate = {
  email: string;
  password: string;
  display_name?: string | null;
  role?: "admin" | "operator";
};

export type AdminUserUpdate = {
  display_name?: string | null;
  role?: "admin" | "operator";
  is_active?: boolean;
  password?: string;
};

export function createAdminUser(body: AdminUserCreate): Promise<AdminUser> {
  return jsonFetch<AdminUser>("/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAdminUser(
  id: string,
  body: AdminUserUpdate,
): Promise<AdminUser> {
  return jsonFetch<AdminUser>(`/api/v1/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type MonthlyCostBucket = {
  month: string; // YYYY-MM
  total_jpy: number;
  by_service: { stt: number; translate: number; tts: number; infra: number };
};

export function listAdminUsers(): Promise<AdminUser[]> {
  return jsonFetch<AdminUser[]>("/api/v1/admin/users");
}

export function getMonthlyCost(
  months = 12,
): Promise<{ months: MonthlyCostBucket[] }> {
  return jsonFetch<{ months: MonthlyCostBucket[] }>(
    `/api/v1/admin/cost-monthly?months=${months}`,
  );
}

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

export async function correctSession(
  sessionId: string,
  body: { lang: string; text: string; seq?: number },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/correct`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`correctSession failed: ${res.status} ${text}`);
  }
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
