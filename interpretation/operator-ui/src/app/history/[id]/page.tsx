"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  getSession,
  getSessionCost,
  type SessionCostSummary,
  type SessionPublic,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

type Props = { params: Promise<{ id: string }> };

export default function SessionSummaryPage({ params }: Props) {
  const ok = useAuthGuard();
  const { id } = use(params);

  const [sess, setSess] = useState<SessionPublic | null>(null);
  const [cost, setCost] = useState<SessionCostSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ok) return;
    Promise.all([getSession(id), getSessionCost(id)])
      .then(([s, c]) => {
        setSess(s);
        setCost(c);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ok, id]);

  if (!ok) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">セッション詳細</h2>
          <Link
            href="/history"
            className="rounded border px-3 py-1 text-sm text-stone-600"
          >
            戻る
          </Link>
        </div>
        <p className="mt-1 text-xs text-stone-500">session: {id}</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {sess && (
          <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
            <dt className="text-xs uppercase text-stone-500">ステータス</dt>
            <dd>{sess.status}</dd>
            <dt className="text-xs uppercase text-stone-500">対象言語</dt>
            <dd>{sess.target_languages.join(", ")}</dd>
            <dt className="text-xs uppercase text-stone-500">開始</dt>
            <dd className="font-mono text-xs">
              {new Date(sess.started_at).toLocaleString("ja-JP")}
            </dd>
            <dt className="text-xs uppercase text-stone-500">終了</dt>
            <dd className="font-mono text-xs">
              {sess.ended_at
                ? new Date(sess.ended_at).toLocaleString("ja-JP")
                : "—"}
            </dd>
          </dl>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif text-lg font-semibold">推定コスト</h3>
          <span className="font-mono text-2xl font-semibold text-brand">
            ¥{cost?.total_jpy?.toFixed(2) ?? "0.00"}
          </span>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {(cost?.breakdown ?? []).map((b) => (
            <li
              key={b.service}
              className="flex justify-between border-b border-stone-100 py-1"
            >
              <span className="font-mono text-xs uppercase text-stone-500">
                {b.service}
              </span>
              <span className="text-stone-600">
                {b.units.toLocaleString()} {b.unit_label}
              </span>
              <span className="font-mono">¥{b.amount_jpy.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
