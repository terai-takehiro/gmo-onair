// テロップCG — 送出コンソールの操作卓（番号呼出＋TAKE／CLEARの2動詞・モック②の右カラム）。
//
// 本番モードの動詞は TAKE と CLEAR の2つに戻した（docs/design/v4/graphics-redesign.md §8）。
// 旧アプリ（client-awards）の「NEXT → TAKE → CLEAR」に倣う——TAKE すると NEXT が自動で
// 次へ進むため「TAKE 連打で1本回せる」。現行にあった「続き」「OUT」「次へ」の3動詞は撤去した:
//   ・続き（進める） → OA 中の行の中へ移した（ConsolePageList.tsx の担当。ここには置かない）
//   ・次へ           → TAKE 自体の自動前進に吸収した（前進ロジックは呼び出し側 GraphicsConsolePage.tsx）
//   ・OUT            → 新設計に無い動詞。スロット単位の個別退出は ConsoleSlotLanes.tsx の
//                      「消す」ボタン（見た目・操作対象は今までの OUT のまま）が引き継ぐ
// TAKE できるのは NEXT に見えているものだけ — ここに「一覧から直接オンエア」は無い
// （行を押して NEXT にする経路がメイン＝ConsolePageList.tsx。ここは NEXT が決まった後の
// 「出す（TAKE）」「消す（CLEAR）」の2手だけを持つ）。
//
// 番号入力はテンキーのグローバル捕捉（GraphicsConsolePage 側の useConsoleKeyboard）で溜まる。
// ここは溜まった数字の表示と、マウス用のボタン（NEXTにする／TAKE 出す／CLEAR 消す）だけ
// （口頭で「5番出して」と番号を呼ぶ運用のため、行クリックとは別にこの経路も残す）。
import { useEffect, useState } from 'react';
import {
  Eraser, Hash, Link2, Radio, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { readCountdownSeconds, readInteractiveQuestionId, readOpenedAt } from './voteInteractive';
import { readVoteState } from './voteState';

/**
 * 締切連動（段6-6）の残り時間表示。OA の投票・クイズページが `voteState==='open'` かつ
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
  callBuffer, nextPage, onCommitCall, onTake, canClear, onClear, votePage = null,
}: {
  /** テンキーで溜まっている呼出番号（空文字 = 未入力） */
  callBuffer: string;
  /** NEXT に立っているページ（無ければ null）。TAKE の disabled 判定に使う */
  nextPage: GraphicsPageRow | null;
  /** 溜まった番号を NEXT に立てる（Enter と同じ。呼び出し側の commitCall をそのまま渡せる） */
  onCommitCall: () => void;
  /** NEXT を OA へ出す */
  onTake: () => void;
  /** CLEAR を押せる状態か（＝消せる何かが残っているか。何を指すかの判定は呼び出し側に委ねる） */
  canClear: boolean;
  /** 最後に TAKE したものを消す */
  onClear: () => void;
  /** OA の投票・クイズページ（段6-6・残り時間表示用）。無ければ null のまま渡す */
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
        <Button type="button" variant="outline" disabled={!callBuffer} onClick={onCommitCall}>
          NEXTにする
        </Button>
      </div>
      <Button
        type="button"
        variant="destructive"
        className="min-h-[56px] w-full text-h2 tracking-wider"
        disabled={!nextPage}
        onClick={onTake}
      >
        <Radio className="mr-2 h-5 w-5" aria-hidden="true" />TAKE 出す
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="min-h-[48px] w-full border-warning-border bg-warning-surface text-warning hover:bg-warning-surface"
        disabled={!canClear}
        onClick={onClear}
        title={canClear ? undefined : '消すものがありません'}
      >
        <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />CLEAR 消す
      </Button>
      <p className="mt-0.5 text-sub-sm text-muted-foreground">
        テンキー＝番号呼出（Enter で NEXT に）／ Space＝TAKE ／ Backspace＝CLEAR ／
        ↑↓＝NEXT 移動。入力欄・ダイアログを開いている間は効きません。
      </p>
    </div>
  );
}
