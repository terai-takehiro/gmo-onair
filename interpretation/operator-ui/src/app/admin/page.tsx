"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMonthlyCost,
  listAdminUsers,
  type AdminUser,
  type MonthlyCostBucket,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { AdminUsers } from "@/components/admin-users";

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildCsv(months: MonthlyCostBucket[]): string {
  const header = "month,stt_jpy,translate_jpy,tts_jpy,infra_jpy,total_jpy";
  const rows = months.map((b) =>
    [
      b.month,
      b.by_service.stt,
      b.by_service.translate,
      b.by_service.tts,
      b.by_service.infra,
      b.total_jpy,
    ].join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

export default function AdminPage() {
  const ok = useAuthGuard();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [months, setMonths] = useState<MonthlyCostBucket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ok) return;
    if (user && user.role !== "admin") {
      router.replace("/");
      return;
    }
    Promise.all([listAdminUsers(), getMonthlyCost(12)])
      .then(([u, c]) => {
        setUsers(u);
        setMonths(c.months);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ok, user, router]);

  if (!ok) return null;
  if (user && user.role !== "admin") return null;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">管理画面</h2>
          <button
            type="button"
            disabled={months.length === 0}
            onClick={() =>
              downloadCsv(`interpretation-cost-${Date.now()}.csv`, buildCsv(months))
            }
            className="rounded-lg bg-brand px-4 py-2 text-sm text-white shadow disabled:opacity-50"
          >
            月次コスト CSV を書出
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="font-serif text-lg font-semibold">月次コスト集計 (直近 12 ヶ月)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">月</th>
                <th className="px-3 py-2 text-right">STT</th>
                <th className="px-3 py-2 text-right">翻訳</th>
                <th className="px-3 py-2 text-right">TTS</th>
                <th className="px-3 py-2 text-right">インフラ</th>
                <th className="px-3 py-2 text-right">合計</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-stone-500">
                    まだ集計データがありません。
                  </td>
                </tr>
              ) : (
                months.map((b) => (
                  <tr key={b.month} className="border-t">
                    <td className="px-3 py-2 font-mono">{b.month}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      ¥{b.by_service.stt.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ¥{b.by_service.translate.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ¥{b.by_service.tts.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ¥{b.by_service.infra.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      ¥{b.total_jpy.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminUsers users={users} onChanged={() => listAdminUsers().then(setUsers)} />
    </section>
  );
}
