/**
 * 「AI で整える」の中身 — **いま／整えたあと を並べて見せる**（設計 §6-③）
 *
 * ── なぜ並べるのか ──────────────────────────────────────────
 *
 * この機能だけは軽い段の AI を使います（§7-1）。軽くしてよいと決めたのは
 * **「崩れは読めば分かる」から**で、読めるように見せることが前提条件です。
 * だから結果だけを出して「置き換えますか？」とは訊きません。
 *
 * ── スマホでは1列（§6-⑨） ─────────────────────────────────
 *
 * 375px に2列は入りません。**「整えたあと」だけ**を出します
 * （元の文は本文に残っているので、置き換える前ならいつでも見比べられます）。
 * 列の出し分けは CSS でやります（`client-wiki/CLAUDE.md`）。
 *
 * ── 結果は打ち直せる ───────────────────────────────────────
 *
 * 「整えたあと」は読むだけの枠ではなく**打てる欄**です。ここで直してから
 * 置き換えると、その差がそのまま「人がどこを直したか」（§7-3 条件2）になります。
 */
import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import type { WikiTidyMode } from '@gmo-onair/shared/src/wiki/types';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { cn } from '@/lib/utils';
import AiTidyDiff from './AiTidyDiff';
import { TIDY_MODES } from './tidyModes';

interface Props {
  mode: WikiTidyMode;
  onModeChange: (m: WikiTidyMode) => void;
  /** 整える元の文（選んだところ・または本文全部） */
  source: string;
  /** 受け取った結果。まだ無ければ null */
  result: string | null;
  onResultChange: (v: string) => void;
  /** 揃えた語（「元の語 → 揃えた語」） */
  changedTerms: string[];
  busy: boolean;
  failed: boolean;
  onRetry: () => void;
}

const PANE_BOX = 'h-[36vh] w-full overflow-y-auto rounded-control border border-border bg-background p-3 text-[14px] leading-[1.85] lg:h-[44vh]';

export default function AiTidyPanes({
  mode, onModeChange, source, result, onResultChange, changedTerms, busy, failed, onRetry,
}: Props) {
  const [view, setView] = useState<'side' | 'diff'>('side');
  const hint = TIDY_MODES.find((m) => m.id === mode)?.hint ?? '';

  return (
    <div className="flex flex-col gap-3">
      {/* やり方。押すと、その場で整え直します */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {TIDY_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={busy}
            aria-pressed={m.id === mode}
            onClick={() => onModeChange(m.id)}
            className={cn(
              'inline-flex min-h-tap shrink-0 items-center rounded-chip border px-3 text-sub lg:min-h-[36px]',
              m.id === mode
                ? 'border-ai-border bg-ai-surface font-bold text-ai'
                : 'border-border text-foreground hover:bg-muted',
              busy && 'pointer-events-none opacity-50',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-sub-sm text-muted-foreground">{hint}</p>

      {result !== null && !busy && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === 'side' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'side'}
            onClick={() => setView('side')}
          >
            並べて見る
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'diff' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'diff'}
            onClick={() => setView('diff')}
          >
            変わったところ
          </Button>
        </div>
      )}

      {busy && (
        <div className={cn(PANE_BOX, 'flex items-center justify-center gap-2 text-sub text-muted-foreground')}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          整えています…
        </div>
      )}

      {!busy && failed && (
        <div className={cn(PANE_BOX, 'flex flex-col items-center justify-center gap-3 text-center')}>
          <p className="text-sub text-muted-foreground">
            整えた文を受け取れませんでした。元の文はそのまま残っています。
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            もう一度実行
          </Button>
        </div>
      )}

      {!busy && !failed && result !== null && view === 'diff' && (
        <div className={PANE_BOX}>
          <AiTidyDiff before={source} after={result} />
        </div>
      )}

      {!busy && !failed && result !== null && view === 'side' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {/* いま（スマホでは出さない・§6-⑨） */}
          <div className="hidden flex-col gap-1.5 lg:flex">
            <span className="text-sub-sm text-muted-foreground">いま</span>
            <div className={cn(PANE_BOX, 'whitespace-pre-wrap break-words text-muted-foreground')}>
              {source}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sub-sm text-muted-foreground">整えたあと</span>
            <textarea
              value={result}
              onChange={(e) => onResultChange(e.target.value)}
              spellCheck={false}
              aria-label="整えたあとの文"
              className={cn(PANE_BOX, 'resize-none text-foreground outline-none focus:border-primary-border-strong')}
            />
            <span className="text-sub-sm text-muted-foreground">
              ここで直してから置き換えられます。
            </span>
          </div>
        </div>
      )}

      {!busy && changedTerms.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-control bg-muted p-3">
          <span className="text-sub-sm text-muted-foreground">揃えた言葉</span>
          <div className="flex flex-wrap gap-1.5">
            {changedTerms.map((t, i) => (
              <span key={`${t}-${i}`} className="rounded-badge bg-card px-2 py-1 text-badge text-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
