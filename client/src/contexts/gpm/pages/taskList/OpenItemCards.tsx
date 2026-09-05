/**
 * ⑤ 全プロジェクトの未確認事項 — スマホのカード（v4ネイティブUI監査 2026-08-20 で追加）
 *
 * ── ③（プロジェクト詳細）の `OpenItemRow` は触らない ──────────
 *
 * `OpenItemRows.tsx` の `OpenItemRow`／`OpenItemRowsHeader` は③プロジェクト
 * 詳細（`GpmProjectDetailPage.tsx`）と⑤このまたぎ一覧（`GpmTaskListPage.tsx`）の
 * **両方**が使う共通部品（今回のバッチの対象は⑤だけ）。ここを直接カードに
 * 書き換えると③の見た目まで変わってしまうので、**このファイルは⑤専用**として
 * 別に用意する。値→色・値→日本語の対応（`OPEN_STATUS_TONE` / `TO_KIND_LABEL` 等）は
 * `../../types.ts` から読むので、判定そのものは1か所のまま——PC の行と
 * スマホのカードで違う日・違う色にはならない。
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行は 未確認事項・プロジェクト（伸びる）／ 状態(96px) ／ 期限(96px) ／
 * できること(160px) の4列。カードでは:
 *
 *   1行目  状態バッジ ・ 期限（右）
 *   2行目  質問（押せる。押すとプロジェクトの未確認事項タブへ）
 *   3行目  プロジェクト名 ・ 相手 ・ 工程
 *   4行目  「◯◯が止まっています」（あるときだけ・赤）
 *   5行目  できること（解決／直す／消す。直せる人だけ）
 */
import type { ReactNode } from 'react';
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  OPEN_STATUS_LABEL, OPEN_STATUS_TONE, TO_KIND_LABEL, dueLabel, dueTone, ymd,
  type GpmOpenItem,
} from '../../types';

export function OpenItemCards({
  rows, today, canEdit, onOpen, onToggleResolved, onEdit, onDelete,
}: {
  rows: GpmOpenItem[];
  today: string;
  /** 直せる人にだけ操作を出す。出しても押せば 403 になるだけ */
  canEdit: boolean;
  onOpen: (item: GpmOpenItem) => void;
  onToggleResolved: (item: GpmOpenItem) => void;
  onEdit: (item: GpmOpenItem) => void;
  onDelete: (item: GpmOpenItem) => void;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {rows.map((item) => {
        const due = ymd(item.due_date);
        const dueText = dueLabel(due, today);
        const resolved = item.status === 'resolved';
        const to = [TO_KIND_LABEL[item.to_kind], item.to_name].filter(Boolean).join(' ');

        return (
          <li
            key={item.id}
            className={cn('rounded-card border border-border bg-card p-3.5', resolved && 'opacity-70')}
          >
            <div className="flex items-center justify-between gap-2">
              <TableBadge w={null} label={OPEN_STATUS_LABEL[item.status]} className={OPEN_STATUS_TONE[item.status]} />
              {/* **解決済みは期限を出さない**（PC の行と同じ）。片づいたものに赤い期限は要らない */}
              {!resolved && dueText && (
                <span className={cn('shrink-0 font-number text-sub', dueTone(due, today))}>{dueText}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpen(item)}
              className="mt-1.5 block w-full text-left text-list text-foreground [overflow-wrap:anywhere] hover:underline"
            >
              {item.question}
            </button>

            <p className="mt-0.5 truncate text-note text-muted-foreground">
              {item.project_name ? `${item.project_name} ・ ` : ''}
              {to}
              {item.phase_label ? ` ・ ${item.phase_label}` : ''}
            </p>

            {/* **「止めているもの」を赤で出す**（PC の行と同じ）。解決済みでは出さない */}
            {item.blocks && !resolved && (
              <p className="mt-1 text-sub-sm text-destructive">{item.blocks} が止まっています</p>
            )}

            {canEdit && (
              <div className="mt-2 flex items-center justify-end gap-1 border-t border-border-faint pt-2">
                <CardIconButton
                  label={resolved ? '未解決に戻す' : '解決にする'}
                  onClick={() => onToggleResolved(item)}
                  tone={resolved ? 'muted' : 'success'}
                >
                  {resolved
                    ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    : <Check className="h-4 w-4" aria-hidden="true" />}
                </CardIconButton>
                <CardIconButton label="編集" onClick={() => onEdit(item)} tone="muted">
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </CardIconButton>
                <CardIconButton label="削除" onClick={() => onDelete(item)} tone="danger">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </CardIconButton>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CardIconButton({
  label, onClick, tone, children,
}: {
  label: string;
  onClick: () => void;
  tone: 'success' | 'muted' | 'danger';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-control-md',
        tone === 'success' && 'text-success hover:bg-success-surface',
        tone === 'muted' && 'text-muted-foreground hover:bg-muted',
        tone === 'danger' && 'text-destructive hover:bg-destructive-surface',
      )}
    >
      {children}
    </button>
  );
}
