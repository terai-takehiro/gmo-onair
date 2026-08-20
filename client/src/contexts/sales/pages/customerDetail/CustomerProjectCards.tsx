/**
 * お客様の詳細（顧客360）— 案件リスト（スマホ・カード積み） (v4)
 *
 * `company/CompanyCards.tsx` と同じ考え方: PC の行を縮めるのではなく
 * 1件＝1枚のカードとして組み直す。列は「名前・ステージ・実施日・金額」の4つだけ
 * なので、崩れやすいのは金額（売上＋粗利の2行）だけ — カードなら幅を気にせず
 * 縦に積める。
 */
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE } from '../projectList/stages';
import type { CustomerProject } from './types';
import type { ProjectStage } from '@/types';

export function CustomerProjectCards({
  items, onOpen,
}: {
  items: CustomerProject[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {items.map((p) => {
        const stage = p.stage as ProjectStage;
        const rev = Number(p.total_revenue) || 0;
        const pur = Number(p.total_purchase) || 0;
        const gp = rev - pur;
        const hasActuals = rev > 0 || pur > 0;
        const expected = Number(p.expected_amount) || 0;

        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="rounded-card active:bg-surface-subtle flex w-full flex-col gap-1.5 border border-border-subtle bg-card p-3.5 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-list min-w-0 flex-1 line-clamp-2 text-foreground">{p.name}</span>
                <TableBadge w={null} label={STAGE_BADGE_LABEL[stage] ?? p.stage} className={STAGE_BADGE_TONE[stage]} />
              </div>
              <p className="text-sub-sm text-muted-foreground">
                {p.gls_number || p.code || '社内コード未設定'}
                {p.event_start ? ` ・ ${p.event_start.replace(/-/g, '/')}` : ''}
              </p>
              {hasActuals ? (
                <p className="text-sub flex items-baseline gap-2 border-t border-border-faint pt-1.5">
                  <Money inline value={rev} />
                  <span className="text-sub-sm text-muted-foreground">
                    粗利 <Money inline value={gp} negativeIsDanger />
                  </span>
                </p>
              ) : expected > 0 ? (
                <p className="text-sub-sm border-t border-border-faint pt-1.5 text-muted-foreground">
                  想定 <Money inline value={expected} />
                </p>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
