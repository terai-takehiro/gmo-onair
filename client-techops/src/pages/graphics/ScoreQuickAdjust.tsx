// テロップCG — 送出コンソールの±クイック調整（スコアボード専用）。
//
// モック②「スコアボード…対戦・ポイントの常駐表示。±ボタンで即時反映（確定操作なし）」。
// PGM/PVW に乗っているスコアページの得点を、フォームを開かずその場で±できる。
// 保存は PUT /graphics/pages/:id（REST）— サーバーが更新後の page を `cg:sync` に
// 同報するので、出力画面・他の送出コンソールへは通常のリアルタイム経路で届く
// （このコンポーネント自身は楽観更新をしない — 自分の画面も同じ `cg:sync` を受けて
// 描き直る。二重の状態管理を避ける）。
import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifyError } from '@/lib/notify';
import { updateGraphicsPage, type GraphicsPageRow } from '@/lib/graphicsApi';
import { normalizeScoreEntries, SCORE_ENTRIES_KEY } from './scoreEntries';

export function ScoreQuickAdjust({ page, label }: {
  page: GraphicsPageRow;
  /** 「いま出ている」「次に出す」等の文脈ラベル（複数のスコアページが同時に見えるとき用） */
  label: string;
}) {
  // 連打で古い entries を基準に上書きしないよう、送信中のエントリーはボタンを止める
  const [pending, setPending] = useState<Set<number>>(new Set());
  const entries = normalizeScoreEntries(page.fields[SCORE_ENTRIES_KEY]);
  if (entries.length === 0) return null;

  const adjust = async (i: number, delta: number) => {
    if (pending.has(i)) return;
    setPending((prev) => new Set(prev).add(i));
    try {
      const next = entries.map((e, idx) => (idx === i ? { ...e, points: e.points + delta } : e));
      await updateGraphicsPage(page.id, { fields: { ...page.fields, [SCORE_ENTRIES_KEY]: next } });
    } catch {
      notifyError('得点を更新できませんでした');
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(i);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-card p-2.5">
      <p className="truncate text-th text-muted-foreground">{label} ／ {page.name}</p>
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => {
          const entryLabel = e.name || `エントリー${i + 1}`;
          const busy = pending.has(i);
          return (
            <div key={i} className="flex items-center gap-1.5 rounded-control-md border border-border-faint bg-surface-subtle px-1.5 py-1">
              <span className="max-w-[8em] truncate text-sub font-bold">{entryLabel}</span>
              <Button
                type="button" variant="outline" size="icon" className="h-11 w-11"
                disabled={busy} onClick={() => void adjust(i, -1)} aria-label={`${entryLabel}を1点減らす`}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="font-number w-10 shrink-0 text-center text-list font-bold tabular-nums">{e.points}</span>
              <Button
                type="button" variant="outline" size="icon" className="h-11 w-11"
                disabled={busy} onClick={() => void adjust(i, 1)} aria-label={`${entryLabel}を1点増やす`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
