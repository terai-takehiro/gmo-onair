"use client";

import { useState } from "react";
import {
  createAdminUser,
  updateAdminUser,
  type AdminUser,
} from "@/lib/api";

type Props = {
  users: AdminUser[];
  onChanged: () => void;
};

export function AdminUsers({ users, onChanged }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAdminUser({
        email: email.trim().toLowerCase(),
        password,
        display_name: displayName || null,
        role,
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("operator");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await updateAdminUser(u.id, { is_active: !u.is_active });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const setUserRole = async (u: AdminUser, next: AdminUser["role"]) => {
    if (u.role === next) return;
    try {
      await updateAdminUser(u.id, { role: next });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="font-serif text-lg font-semibold">ユーザー管理</h3>

      <form
        onSubmit={onCreate}
        className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5"
      >
        <input
          type="email"
          required
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="password (>=8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          type="text"
          placeholder="display name (任意)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "operator")}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="operator">operator</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1 text-sm text-white shadow disabled:opacity-50"
        >
          作成
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 divide-y text-sm">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="font-medium">{u.email}</p>
              <p className="text-xs text-stone-500">
                {u.display_name ?? "(no name)"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={u.role}
                onChange={(e) =>
                  setUserRole(u, e.target.value as AdminUser["role"])
                }
                className="rounded border px-2 py-1 text-xs"
              >
                <option value="operator">operator</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="button"
                onClick={() => toggleActive(u)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  u.is_active
                    ? "border-stone-300 bg-white text-stone-700"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {u.is_active ? "有効" : "無効"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
