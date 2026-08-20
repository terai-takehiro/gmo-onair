/**
 * 案件台帳のスマホ表示 — カード（パターンB。`projectList/ProjectCards.tsx` と同じ型）
 *
 * ── 表の縦積みではなくカードにした理由 ──────────────────────
 *
 * この画面は「一括編集」が主目的なので PC 専用でしたが、**既定表示の9列を読む**
 * だけなら 375px でもできます。ただし `Row stackOnMobile` で縦積みにすると、
 * 20 列ぶんの `RowSlot` を全部並べることになり優先順位が付きません。
 * ここは金額と分類（＝この画面が直したい対象）を目立たせたいので、
 * `ProjectCards.tsx` と同じく**ゼロから組み直します**。
 *
 * ── 出す項目は既定表示9列と同じ（`COL_DEFS` の `default: true`）──
 *
 * GLS番号・案件名・お客様・ステージ・案件分類・実施日・見積金額・
 * 社内の担当・最後の動き。**列を増やしたいときは `COL_DEFS` を直すだけ**
 * （この画面は決め打ちの並びなので、列の出し入れ設定〔`ColumnPicker`〕は
 * スマホでは意味を持たない＝ページ側でボタンごと隠しています）。
 *
 * ── 一括編集の升目には触らない ──────────────────────────────
 *
 * チェックボックス・二度押しでの直接編集・Ctrl+C/V は**このカードには無い**。
 * 押すと案件詳細（`/sales/projects/:id`）へ行くだけの読む専用の入口です
 * （一括編集は PC 専用のまま・`ProjectLedgerPage.tsx` 側の判定）。
 *
 * ── 判定ロジックは書き写さない ────────────────────────────────
 *
 * ステージの色・案件分類の組み立て・金額の判定（0円は「—」）・相対時刻は
 * すべて既存の関数を import して使う。**ここに新しいルールを作らない**。
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { ProjectStageLabels } from '@/types';
import { classificationLabel } from '@/contexts/sales/classification';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE } from '../projectList/stages';
import { num } from './LedgerCells';
import type { LedgerRow } from './types';

export function MobileLedgerCards({ rows }: { rows: LedgerRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const estimate = num(row.estimate_amount);
        const classification = classificationLabel(row.audience, row.project_category);
        return (
          <li key={row.id}>
            {/* **カード全体が押せる。** チェックボックスも編集も持たないので、
                行き先を選ぶ以外の操作が無い＝1つの `<Link>` にできる */}
            <Link
              to={`/sales/projects/${row.id}`}
              className="rounded-card flex w-full items-start gap-2.5 border border-border bg-card p-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="mb-1 flex flex-wrap items-center gap-1.5">
                  <TableBadge
                    w={null}
                    label={STAGE_BADGE_LABEL[row.stage]}
                    title={ProjectStageLabels[row.stage]}
                    className={STAGE_BADGE_TONE[row.stage]}
                  />
                  <span className="text-note font-number text-muted-foreground">
                    {row.gls_number ?? 'ヨミ段階'}
                  </span>
                </span>

                {/* **案件名は折り返す。** truncate すると似た名前の案件を見分けられない
                    （`ProjectCards.tsx` と同じ理由） */}
                <span className="text-list block font-bold [overflow-wrap:anywhere]">{row.name}</span>
                <span className="text-note mt-0.5 block truncate text-muted-foreground">
                  {row.customer_name ?? '—'}
                </span>
                <span className="text-note mt-0.5 block truncate text-muted-foreground">
                  {classification ?? '案件分類：入っていません'}
                </span>

                <span className="mt-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-note min-w-0 truncate text-muted-foreground">
                    {row.event_start ? <span className="font-number">{row.event_start}</span> : '実施日 未定'}
                  </span>
                  {estimate > 0
                    ? <Money value={estimate} className="shrink-0 text-list" />
                    : <span className="text-note shrink-0 text-muted-foreground">見積 —</span>}
                </span>

                <span className="mt-1 flex items-center justify-between gap-3 border-t border-border-faint pt-1.5 text-note text-muted-foreground">
                  <span className="min-w-0 truncate">{row.assigned_to_name ?? '担当 —'}</span>
                  <span className="shrink-0">
                    {row.last_activity_at ? formatRelativeTime(row.last_activity_at) : '—'}
                  </span>
                </span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
