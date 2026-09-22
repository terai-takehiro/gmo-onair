// テロップCG — 送出コンソールのランキング発表 Final Pitch 操作パネル（段6-5第1弾）。
//
// PGM（送出中）のページが `partKey === 'ranking'` かつ `fields.step === 'final-pitch'` の
// ときだけ `GraphicsConsolePage.tsx` から条件付きでマウントされる
// （`ScoreQuickAdjust.tsx` と同じ「PUT /graphics/pages/:id・自分自身は楽観更新せず
// `cg:sync` の折り返しで描き直る」配線パターン）。持つのは①②③のピック切替
// （`fields.subPhase`）と、連動アンケートの概念が無い今回のスコープでの手動No.1選択
// （`fields.winnerEntryIndex`）——実際の出力側の描画（誰をどう見せるか）は並行実装
// （出力レンダラー）の担当で、ここはコンソール側の状態遷移だけを持つ。
import { useState } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { notifyError } from '@/lib/notify';
import { updateGraphicsPage, type GraphicsPageRow } from '@/lib/graphicsApi';
import {
  normalizeRankingEntries, readAwardPattern, readSubPhase, readWinnerEntryIndex,
  RANKING_ENTRIES_KEY, withRankingSubPhase, withWinnerEntryIndex,
} from './rankingFields';

const PICK_LABELS = ['①', '②', '③'];

export function RankingControlPanel({ page }: { page: GraphicsPageRow }) {
  // 連打で古い fields を基準に上書きしないよう、送信中はボタン・セレクトを止める
  // （ScoreQuickAdjust.tsx と同じ考え方）
  const [pending, setPending] = useState(false);
  const entries = normalizeRankingEntries(page.fields[RANKING_ENTRIES_KEY]);
  const awardPattern = readAwardPattern(page.fields);
  const subPhase = readSubPhase(page.fields);
  const winnerEntryIndex = readWinnerEntryIndex(page.fields);

  const pushSubPhase = async (phase: number) => {
    if (pending) return;
    setPending(true);
    try {
      await updateGraphicsPage(page.id, { fields: withRankingSubPhase(page.fields, phase) });
    } catch {
      notifyError('表示を切り替えられませんでした');
    } finally {
      setPending(false);
    }
  };

  const pickWinner = async (index: number | null) => {
    if (pending) return;
    setPending(true);
    try {
      await updateGraphicsPage(page.id, { fields: withWinnerEntryIndex(page.fields, index) });
    } catch {
      notifyError('No.1を選べませんでした');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-2.5">
      <p className="truncate text-th text-muted-foreground">
        <Users className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Final Pitch ／ {page.name}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 2, 3].map((phase) => (
          <Button
            key={phase}
            type="button" variant={subPhase === phase ? 'default' : 'outline'} size="sm"
            className="min-h-[44px]" disabled={pending} onClick={() => void pushSubPhase(phase)}
          >
            {PICK_LABELS[phase - 1]}だけにする
          </Button>
        ))}
        <Button
          type="button" variant={subPhase === 0 ? 'default' : 'outline'} size="sm"
          className="min-h-[44px]" disabled={pending} onClick={() => void pushSubPhase(0)}
        >
          3人並びに戻す
        </Button>
      </div>

      {/* vote パターン: 連動アンケートが無い今回のスコープでは、No.1をここから手動で選ぶ */}
      {awardPattern === 'vote' && (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="ranking-winner-select" className="shrink-0 text-sub text-muted-foreground">
            No.1を手動で選ぶ
          </Label>
          <Select
            value={winnerEntryIndex != null ? String(winnerEntryIndex) : ''}
            onValueChange={(v) => void pickWinner(v === '' ? null : Number(v))}
            disabled={pending || entries.length === 0}
          >
            <SelectTrigger id="ranking-winner-select" className="min-h-[44px] w-auto min-w-[10rem]">
              <SelectValue placeholder="未入力" />
            </SelectTrigger>
            <SelectContent>
              {entries.map((e, i) => (
                <SelectItem key={i} value={String(i)}>{e.name || `エントリー${i + 1}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
