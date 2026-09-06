/**
 * 改番の対象一覧・1行分（会社と切替 ⑧・移行センター・`docs/reorg-2026-10-plan.md` §4.8点2）
 *
 * 列は指示書のとおり: 現在の番号・実施日・お客様・グループ内外・導出された計上会社・
 * 止める理由。**計上会社バッジは案件一覧・詳細・台帳と同じ表現を流用する**
 * （`ENTITY_BADGE_LABEL`/`ENTITY_BADGE_TONE`・`projectList/stages.ts`）——
 * 同じ概念を画面によって違う見せ方にしない（`docs/reorg-2026-10-plan.md` 用語表の教訓）。
 *
 * **ダイアログはこの部品の外（`RenumberCandidatesPanel`）に1つだけ置く**
 * （`MembersPage.tsx` の `userDialog` と同じ作法）。行ごとにダイアログを持たせると、
 * 対象が多い日に開いていないダイアログ・使わない `useQuery` が行数ぶん増える。
 */
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Row, RowMain, RowTitle, RowSlot,
} from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { formatDate } from '@/lib/format';
import { ENTITY_BADGE_LABEL, ENTITY_BADGE_TONE } from '@/contexts/sales/pages/projectList/stages';
import type { RenumberCandidate } from './types';

/**
 * グループ内外の色。**`ENTITY_BADGE_TONE` と同じ「淡い面＋濃い文字」の作法**に
 * 揃えるための専用トーン（案件一覧の `<TableBadge label="グループ">`（`CompanyRows.tsx`）は
 * true のときだけ出す省略形だが、ここは**導出根拠そのもの**を確かめる列なので、
 * 両方の状態を明示する）。
 */
const GROUP_TONE = {
  in: 'border-transparent bg-info-surface text-info',
  out: 'border-transparent bg-muted text-muted-foreground',
} as const;

export function RenumberRow({
  candidate, canEdit, onRenumber,
}: {
  candidate: RenumberCandidate;
  canEdit: boolean;
  onRenumber: () => void;
}) {
  return (
    <Row density="table" divider align="start">
      <RowMain>
        <RowTitle>{candidate.name}</RowTitle>
        {/* §4.8「インテリジェンス GLS-A023」の実例。規則だけでは検出できない切り替わりを
            目立たせるだけで、自動では書き換えない（人が理由付きの改番で直す運用） */}
        {candidate.self_customer_hint && (
          <p className="text-note mt-1 flex items-start gap-1.5 text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>この客先はうちが計上会社そのものかもしれません（自動では書き換えません）</span>
          </p>
        )}
      </RowMain>

      <RowSlot w={96}>
        <span className="font-number text-sub">{candidate.current_number}</span>
      </RowSlot>

      <RowSlot w={96}>
        {candidate.event_date ? <span className="text-sub">{formatDate(candidate.event_date)}</span> : null}
      </RowSlot>

      <RowSlot w={160}>
        <span className="text-sub truncate">{candidate.customer_name || 'お客様 未設定'}</span>
      </RowSlot>

      <RowSlot w={96}>
        <TableBadge
          w={null}
          label={candidate.is_gmo_group ? 'グループ内' : 'グループ外'}
          className={candidate.is_gmo_group ? GROUP_TONE.in : GROUP_TONE.out}
        />
      </RowSlot>

      <RowSlot w={72}>
        <TableBadge
          w={null}
          label={candidate.target_entity_code}
          title={`${ENTITY_BADGE_LABEL[candidate.target_entity_code]}・${candidate.reason}`}
          className={ENTITY_BADGE_TONE[candidate.target_entity_code]}
        />
      </RowSlot>

      <RowSlot w={200}>
        {candidate.has_invoiced_revenue ? (
          <span
            className="text-note truncate text-muted-foreground"
            title="発行済み・入金済みの売上があります。請求書発行済み（請求キーは変わりません）。"
          >
            請求書発行済み（請求キーは変わりません）
          </span>
        ) : null}
      </RowSlot>

      <RowSlot w={128} align="right">
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={onRenumber}>改番</Button>
        ) : null}
      </RowSlot>
    </Row>
  );
}
