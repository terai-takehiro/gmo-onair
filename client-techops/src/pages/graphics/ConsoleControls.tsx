// テロップCG — 送出コンソールの操作卓（番号呼出＋5動詞・モック②の右カラム）。
//
// 動詞は5つだけ（docs/design/v4/graphics.md §4）:
//   スタンバイ（番号呼出→PVW）／ TAKE ／ 続き（多段アニメ・後日）／ OUT ／ 次へ
// TAKE できるのは PVW に見えているものだけ — ここに「リストから直接オンエア」は無い。
//
// 番号はテンキーのグローバル捕捉（GraphicsConsolePage 側）で溜まる。ここは
// 溜まった数字の表示と、マウス用のボタン（スタンバイ／TAKE／次へ／続き／OUT）だけ。
import { Hash, Radio, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GraphicsPageRow } from '@/lib/graphicsApi';

export function ConsoleControls({ callBuffer, pvwPage, onStandby, onTake, onNext, onOut }: {
  /** テンキーで溜まっている呼出番号（空文字 = 未入力） */
  callBuffer: string;
  pvwPage: GraphicsPageRow | null;
  /** 溜まった番号を PVW に立てる（Enter と同じ） */
  onStandby: () => void;
  onTake: () => void;
  onNext: () => void;
  /** PVW と同じスロットのオンエアを下ろす */
  onOut: () => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 rounded-card border border-border bg-card p-3 lg:w-[300px]">
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
        {/* 続き（Continue）は多段アニメ（ストップポイント）実装後に生かす — §4 */}
        <Button type="button" variant="outline" className="flex-1" disabled title="多段アニメの実装後に使えるようになります">
          続き（多段アニメ・後日）
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
