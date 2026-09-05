import { Timer, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/**
 * 計時・視聴者 v4.1 段2 — 旧セッション一覧（`SessionHomePage.tsx`）の廃止に伴う
 * 案内画面。`/live/`（このバンドルの index ルート）に置く。
 *
 * `docs/design/v4/techops-v4-coding/12-live-timer-decision.md` §3-5 は「抜け道として
 * 残す」としていたが、このステージでユーザーが明示的に上書き決定した
 * （セッション一覧・案件に紐づかないスタンドアロン作成は廃止）。
 *
 * ⚠️ **ハードリダイレクトはしない。** ブックマークしてこの URL を直接開いた人に
 * 「何が起きたか」を分からせるため、まず案内を見せてから自分でリンクを押してもらう
 * （GROUND_RULES §1「セッション一覧・スタンドアロン作成の廃止」）。
 */
export default function LiveHomeNoticePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15">
        <Timer className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-sm font-bold">計時・視聴者は制作技術支援の案件から開けます</h1>
        <p className="max-w-sm text-xs text-muted-foreground">
          「セッション一覧」はこの画面から無くなりました。番組・イベントの案件を開き、
          そこに用意されたタイル（進行台本などと同じ並び）から計時・視聴者を開いてください。
        </p>
      </div>
      <a
        href="/techops/top"
        className="flex min-h-tap items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        制作技術支援のトップを開く
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
      {/* 案件に紐づかない旧スタンドアロン program（`project_id IS NULL`）へ辿り着く
          唯一の入口（管理者向け・GROUND_RULES §致命的2）。作成導線ではないので
          目立たせすぎない — 主導線（上の「トップを開く」）の下に小さく置く */}
      {canManage && (
        <a
          href="/techops/live-legacy"
          className="flex min-h-tap items-center px-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          案件に入っていない番組を探す
        </a>
      )}
    </div>
  );
}
