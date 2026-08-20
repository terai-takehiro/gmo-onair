// 9 マスの1マスぶんの点数バッジ。
// スコア順リスト・9マスボード・編集/作成ダイアログのプレビューが共有する
// （書き写すと、色の段（`scoreTone`）を直したときにどこかだけ古いままになる）。
import { cn } from '@/lib/utils';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { scoreTone } from '@/lib/tasksApi';

export function CellScoreBadge({ score }: { score: number }) {
  return <TableBadge label={String(score)} w={null} className={cn('font-number', scoreTone(score))} />;
}
