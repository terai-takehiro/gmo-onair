// テロップCG — 送出コンソールの操作卓（番号呼出＋5動詞・モック②の右カラム）。
//
// 動詞は5つだけ（docs/design/v4/graphics.md §4）:
//   スタンバイ（番号呼出→PVW）／ TAKE ／ 続き（多段アニメ・後日）／ OUT ／ 次へ
// TAKE できるのは PVW に見えているものだけ — ここに「リストから直接オンエア」は無い。
//
// 番号はテンキーのグローバル捕捉（GraphicsConsolePage 側）で溜まる。ここは
// 溜まった数字の表示と、マウス用のボタン（スタンバイ／TAKE／次へ／続き／OUT）だけ。
import { useEffect, useState } from 'react';
import {
  Hash, Link2, Radio, SkipForward, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { readCountdownSeconds, readInteractiveQuestionId, readOpenedAt } from './voteInteractive';
import { readVoteState } from './voteState';

/**
 * 締切連動（段6-6）の残り時間表示。PGM の投票・クイズページが `voteState==='open'` かつ
 * `countdownSeconds`/`openedAt` の両方が設定されているときだけ出す。凝った演出は不要
 * （タスク指示どおり）——`setInterval` で1秒ごとに再計算するだけの簡単な表示。
 */
function VoteCountdownBadge({ votePage }: { votePage: GraphicsPageRow | null }) {
  const countdownSeconds = votePage ? readCountdownSeconds(votePage.fields) : null;
  const openedAt = votePage ? readOpenedAt(votePage.fields) : null;
  const isOpen = votePage ? readVoteState(votePage.fields) === 'open' : false;
  const linked = votePage ? !!readInteractiveQuestionId(votePage.fields) : false;
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || countdownSeconds == null || !openedAt) {
      setRemaining(null);
      return;
    }
    const openedMs = new Date(openedAt).getTime();
    const tick = () => {
      const elapsedSec = (Date.now() - openedMs) / 1000;
      setRemaining(Math.max(0, Math.ceil(countdownSeconds - elapsedSec)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOpen, countdownSeconds, openedAt]);

  if (remaining == null) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-control-md border border-info-border bg-info-surface px-3 py-1.5 text-sub font-bold text-info">
      <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-number">締切まで残り {remaining} 秒</span>
      {linked && (
        <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-control bg-info px-1.5 text-[10px] font-bold text-info-foreground">
          <Link2 className="h-2.5 w-2.5" aria-hidden="true" />外部連携
        </span>
      )}
    </div>
  );
}

export function ConsoleControls({
  callBuffer, pvwPage, onStandby, onTake, onNext, onOut, continueTarget, onContinue, votePage = null,
}: {
  /** テンキーで溜まっている呼出番号（空文字 = 未入力） */
  callBuffer: string;
  pvwPage: GraphicsPageRow | null;
  /** 溜まった番号を PVW に立てる（Enter と同じ） */
  onStandby: () => void;
  onTake: () => void;
  onNext: () => void;
  /** PVW と同じスロットのオンエアを下ろす */
  onOut: () => void;
  /**
   * 「続き」の対象（段6-1・汎用機構）。**PVW ではなく PGM**（いまオンエア中のページ）に
   * 段階公開に対応した部品が乗っているときだけ非 null になる（`pageSupportsReveal`）。
   * null の間はボタンを disabled のままにする。
   */
  continueTarget: GraphicsPageRow | null;
  onContinue: () => void;
  /** PGM の投票・クイズページ（段6-6・残り時間表示用）。無ければ null のまま渡す */
  votePage?: GraphicsPageRow | null;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 rounded-card border border-border bg-card p-3 lg:w-[300px]">
      <VoteCountdownBadge votePage={votePage} />
      <div className="flex items-center gap-2">
        <span className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-control-lg border border-border bg-surface-subtle px-3">
          <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-number min-w-0 flex-1 truncate text-list font-bold" aria-live="polite">
            {callBuffer || <span className="font-normal text-muted-foreground">番号で呼出</span>}
          </span>
        </span>
        <Button type="button" variant="outline" disabled={!callBuffer} onClick={onStandby}>
          スタンバイ
        </Button>
      </div>
      <Button
        type="button"
        variant="destructive"
        className="min-h-[56px] w-full text-h2 tracking-wider"
        disabled={!pvwPage}
        onClick={onTake}
      >
        <Radio className="mr-2 h-5 w-5" aria-hidden="true" />TAKE
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full border-warning-border bg-warning-surface text-warning hover:bg-warning-surface"
        disabled={!pvwPage}
        onClick={onNext}
      >
        <SkipForward className="mr-1.5 h-4 w-4" aria-hidden="true" />次へ（TAKE ＋ 次をスタンバイ）
      </Button>
      <div className="flex gap-2">
        {/* 続き（段6-1・汎用機構）: PGM に段階公開対応の部品が乗っているときだけ押せる */}
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={!continueTarget}
          onClick={onContinue}
          title={continueTarget ? undefined : 'いま出ているページに段階公開の部品がありません'}
        >
          続き
        </Button>
        <Button type="button" variant="outline" className="flex-1" disabled={!pvwPage} onClick={onOut}>
          OUT
        </Button>
      </div>
      <p className="mt-0.5 text-sub-sm text-muted-foreground">
        テンキー＝番号呼出（Enter で確定）／ Space＝TAKE ／ Enter＝次へ ／ ↑↓＝スタンバイ移動。
        入力欄・ダイアログを開いている間は効きません。
      </p>
    </div>
  );
}
