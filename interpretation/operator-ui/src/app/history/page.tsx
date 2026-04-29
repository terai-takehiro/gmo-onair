"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSessions, type SessionPublic } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

const STATUS_STYLES: Record<SessionPublic["status"], string> = {
  live: "bg-red-100 text-red-700",
  ended: "bg-stone-100 text-stone-700",
  aborted: "bg-amber-100 text-amber-700",
};

export default function HistoryPage() {
  const ok = useAuthGuard();
  const [items, setItems] = useState<SessionPublic[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ok) return;
    listSessions()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ok]);

  if (!ok) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-semibold">セッション履歴</h2>
        <p className="mt-1 text-sm text-stone-500">
          自分が作成したセッション (admin は全件) を最新順で表示します。
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">開始日時</th>
              <th className="px-3 py-2">ステータス</th>
              <th className="px-3 py-2">対象言語</th>
              <th className="px-3 py-2">所要時間</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-stone-500">
                  履歴はまだありません。
                </td>
              </tr>
            ) : (
              items.map((s) => {
                const start = new Date(s.started_at);
                const end = s.ended_at ? new Date(s.ended_at) : null;
                const durMin = end
                  ? Math.max(
                      0,
                      Math.round(
                        (end.getTime() - start.getTime()) / 60000,
                      ),
                    )
                  : null;
                return (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">
                      {start.toLocaleString("ja-JP")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[s.status]}`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.target_languages.join(", ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {durMin !== null ? `${durMin} 分` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Link
                        href={`/history/${s.id}`}
                        className="text-brand hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
