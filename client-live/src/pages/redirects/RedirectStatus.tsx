import { useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * 計時・視聴者 v4.1 段2 — 旧URLのリダイレクト専用の薄い画面が共通で使う見た目。
 *
 * `RedirectOnce`（`shared/src/client/RedirectOnce.tsx`）は同一バンドル内の
 * react-router `navigate()` を使うため、別バンドル（`client-techops`・`/qsheet/...`）
 * へは飛ばせない。ここでは `window.location.replace()` によるハード遷移を行う
 * （12-live-timer-decision.md・GROUND_RULES §2）。
 */
export type RedirectTarget =
  /** 行き先が決まった。マウント後に window.location.replace する */
  | { status: 'redirect'; to: string }
  /** 解決中（API 呼び出し中など） */
  | { status: 'loading' }
  /** 行き先を作れない（project_id の無い旧スタンドアロン等）。真っ白にせず案内する */
  | { status: 'blocked'; message: string }
  /** 取得に失敗した（認証切れ・404など） */
  | { status: 'error'; message: string };

/** 各リダイレクト画面の本体。ローディング表示→即遷移。失敗時は無言で固まらない */
export function RedirectView({ target }: { target: RedirectTarget }) {
  useEffect(() => {
    if (target.status === 'redirect') {
      window.location.replace(target.to);
    }
  }, [target]);

  if (target.status === 'blocked' || target.status === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">{target.message}</p>
        <a href="/qsheet/top" className="text-xs text-primary underline underline-offset-2">
          制作技術支援のトップを開く
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
    </div>
  );
}
