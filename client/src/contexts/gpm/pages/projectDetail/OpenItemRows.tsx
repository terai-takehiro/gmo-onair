/**
 * 未確認事項の行 — ③ プロジェクト詳細と ⑤ タスク一覧の**両方が使う**
 *
 * ── 1つの部品にする理由 ────────────────────────────────────
 *
 * 同じ表を2か所に書くと、片方だけ「解決」を押せるようになる／片方だけ
 * 期限超過が赤くならない、が必ず起きます。**行の描き方は1つ**にして、
 * プロジェクト名を出すかどうかだけ切り替えます。
 *
 * ── なぜ「止めているもの」を赤で出すか ──────────────────────
 *
 * 未確認事項は「訊いたまま返事が来ていない」ことより、**それが何を止めて
 * いるか**が読み手の判断材料です（モックのダッシュボードも「◯◯が止まって
 * います」を赤で出しています）。空のときは出しません — 全部の行に赤が付くと
 * 本当に止まっている行が拾えなくなります。
 */
import type { ReactNode } from 'react';
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  OPEN_STATUS_LABEL, OPEN_STATUS_TONE, TO_KIND_LABEL, dueLabel, dueTone, ymd,
  type GpmOpenItem,
} from '../../types';

export function OpenItemRowsHeader({ withProject }: { withProject: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain>{withProject ? '持ち帰り ／ プロジェクト' : '持ち帰り'}</RowMain>
      <RowSlot w={96}>状態</RowSlot>
      <RowSlot w={96}>期限</RowSlot>
      <RowSlot w={160} align="right">できること</RowSlot>
    </RowHeader>
  );
}

export interface OpenItemRowProps {
  item: GpmOpenItem;
  today: string;
  /** プロジェクト名を出すか（またぎの一覧では出す） */
  withProject: boolean;
  /** 直せる人にだけ操作を出す。出しても押せば 403 になるだけ */
  canEdit: boolean;
  onToggleResolved: (item: GpmOpenItem) => void;
  onEdit: (item: GpmOpenItem) => void;
  onDelete: (item: GpmOpenItem) => void;
  /** 行を押したときの行き先（またぎの一覧だけ持つ） */
  onOpen?: (item: GpmOpenItem) => void;
}

export function OpenItemRow({
  item, today, withProject, canEdit, onToggleResolved, onEdit, onDelete, onOpen,
}: OpenItemRowProps) {
  const due = ymd(item.due_date);
  const dueText = dueLabel(due, today);
  const resolved = item.status === 'resolved';
  const to = [TO_KIND_LABEL[item.to_kind], item.to_name].filter(Boolean).join(' ');

  return (
    <Row divider align="start" stackOnMobile className={cn(resolved && 'opacity-70 hover:opacity-100')}>
      <RowMain>
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="text-list min-w-0 max-w-full truncate text-left text-foreground hover:underline"
          >
            {item.question}
          </button>
        ) : (
          <RowTitle>{item.question}</RowTitle>
        )}
        <RowSub>
          {withProject && item.project_name ? `${item.project_name} ・ ` : ''}
          {to}
          {item.phase_label ? ` ・ ${item.phase_label}` : ''}
        </RowSub>
        {item.blocks && !resolved && (
          <p className="text-sub-sm text-destructive">{item.blocks} が止まっています</p>
        )}
      </RowMain>

      <TableBadge
        w={96}
        label={OPEN_STATUS_LABEL[item.status]}
        className={OPEN_STATUS_TONE[item.status]}
      />

      <RowSlot w={96} className={cn('text-sub font-number', dueTone(due, today))}>
        {resolved ? null : dueText}
      </RowSlot>

      <RowSlot w={160} align="right" placeholder="">
        {canEdit ? (
          <span className="flex items-center gap-1">
            <IconButton
              label={resolved ? '未解決に戻す' : '解決にする'}
              onClick={() => onToggleResolved(item)}
              tone={resolved ? 'muted' : 'success'}
            >
              {resolved
                ? <RotateCcw className="h-4 w-4" aria-hidden="true" />
                : <Check className="h-4 w-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label="編集" onClick={() => onEdit(item)} tone="muted">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
            <IconButton label="削除" onClick={() => onDelete(item)} tone="danger">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
          </span>
        ) : null}
      </RowSlot>
    </Row>
  );
}

function IconButton({
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
        'min-h-tap rounded-control-md flex w-11 items-center justify-center lg:min-h-[36px] lg:w-9',
        tone === 'success' && 'text-success hover:bg-success-surface',
        tone === 'muted' && 'text-muted-foreground hover:bg-muted',
        tone === 'danger' && 'text-destructive hover:bg-destructive-surface',
      )}
    >
      {children}
    </button>
  );
}
