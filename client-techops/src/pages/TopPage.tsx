/**
 * 「進行台本」の案件選択（ステージ別の件数つき・`/techops/home`）。
 *
 * サーバーは**数えた事実だけ**返す（`GET /techops/scopes`）。割合・進み具合は
 * ここでは計算しない。表示語（`SCOPE_GROUP_LABEL`）はサーバーに置かず、ここ1か所に置く
 * （`shared/src/client/apps.ts` の教訓＝名前を2か所に書かない）。
 *
 * ⚠️ **アプリ全体（制作技術支援）のトップではない。** 見出しが「制作技術支援」
 * だった（段3当時の実装）が、2026-08-22（ご指摘）に構成そのものを訂正した:
 *
 *   ① `/techops/top`（`ProductionTopPage.tsx`）= アプリのトップ。**まず番組・
 *      イベントを選ぶ**（GLS案件 or ここだけの番組）
 *   ② 選んだ先のハブ画面（`JourneyPage.tsx`・`/techops/projects/:id` /
 *      `/techops/programs/:id`）= そこで初めてミニアプリ（進行台本・スケジュール表・
 *      収録設定・配信設定）のタイルが並ぶ
 *
 * つまり **①→②→ミニアプリ** の順で、この画面（ステージ別の件数つき案件選択）は
 * ①のもう1つの入口候補として残しているだけで、主導線からは外れている
 * （`nav.ts` にもリンクしていない・URL は生かしたまま）。
 *
 * 段3の時点では、この画面から先（案件ごとのジャーニー・資料単体のジャーニー）は
 * まだ作っていない。件数の表示までがこの段の範囲（03-app-structure-impl.md §8 の PR E）。
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2, FolderKanban, Lightbulb, FileText, Clock } from "lucide-react";
import api from "@/lib/api";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";

type ScopeGroup = "in_progress" | "pre_project" | "neta" | "standalone";
interface ScopeCard {
  group: ScopeGroup;
  count: number;
}

const SCOPE_GROUP_LABEL: Record<ScopeGroup, string> = {
  in_progress: "進行中の案件",
  pre_project: "案件化前",
  neta: "ネタ（検討中）",
  standalone: "案件に紐づかない資料",
};

const SCOPE_GROUP_ICON: Record<ScopeGroup, typeof FolderKanban> = {
  in_progress: FolderKanban,
  pre_project: Clock,
  neta: Lightbulb,
  standalone: FileText,
};

const SCOPE_ORDER: ScopeGroup[] = ["in_progress", "pre_project", "neta", "standalone"];

export default function TopPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["qsheet-scopes"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ScopeCard[] }>("/techops/scopes");
      return res.data.data;
    },
  });

  const countOf = (group: ScopeGroup): number => data?.find((c) => c.group === group)?.count ?? 0;

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">進行台本</h1>
      <p className="mt-1 text-sm text-muted-foreground">案件を選ぶと、その案件の台本制作の状態がわかります。</p>

      {isLoading && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">読み込み中…</span>
        </div>
      )}

      {isError && (
        <div className="mt-8">
          <EmptyState title="読み込めませんでした" description="時間を置いてもう一度お試しください。" />
        </div>
      )}

      {!isLoading && !isError && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:grid-cols-2">
          {SCOPE_ORDER.map((group) => {
            const Icon = SCOPE_GROUP_ICON[group];
            const count = countOf(group);
            return (
              <div
                key={group}
                className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card p-4"
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground">{SCOPE_GROUP_LABEL[group]}</div>
                  <div className="text-lg font-semibold text-foreground">{count} 件</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <a
          href="/techops/sheets"
          className="inline-flex min-h-[44px] items-center rounded-md border border-border px-4 text-sm text-foreground hover:bg-accent"
        >
          進行台本の一覧を見る →
        </a>
      </div>
    </div>
  );
}
