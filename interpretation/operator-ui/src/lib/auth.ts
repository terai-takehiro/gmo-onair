"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export type User = {
  id: string;
  email: string;
  display_name?: string | null;
  role: "admin" | "operator";
};

type AuthState = {
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  setSession: (token: string, expiresAt: string, user: User) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      user: null,
      setSession: (token, expiresAt, user) =>
        set({ token, expiresAt, user }),
      clear: () => set({ token: null, expiresAt: null, user: null }),
    }),
    {
      name: "interp-auth",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed: ${res.status} ${text}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    expires_at: string;
  };
  const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  if (!meRes.ok) throw new Error(`/auth/me failed: ${meRes.status}`);
  const user = (await meRes.json()) as User;
  useAuth.getState().setSession(tok.access_token, tok.expires_at, user);
}

export function logout(): void {
  useAuth.getState().clear();
}

export function bearer(): string | null {
  const { token, expiresAt } = useAuth.getState();
  if (!token || isExpired(expiresAt)) return null;
  return token;
}
