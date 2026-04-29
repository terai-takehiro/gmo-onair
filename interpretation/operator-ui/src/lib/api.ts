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

export async function createSession(
  body: CreateSessionRequest,
): Promise<CreateSessionResponse> {
  const token = process.env.NEXT_PUBLIC_DEV_BEARER_TOKEN;
  const res = await fetch(`${API_BASE}/api/v1/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createSession failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CreateSessionResponse;
}

export async function endSession(sessionId: string): Promise<void> {
  const token = process.env.NEXT_PUBLIC_DEV_BEARER_TOKEN;
  await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/end`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}
