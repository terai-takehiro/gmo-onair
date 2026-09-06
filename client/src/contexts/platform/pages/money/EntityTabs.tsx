/**
 * お金のルールの会社タブ — 2026年10月の事業再編（`docs/reorg-2026-10-plan.md` §4.5・§4.6・
 * §6 P2 Round 1）。締め日・支払月/日・税率・税丸めなど、お金のルール本体は会社
 * （`entity_code`）ごとに別設定になった（migration 286）ので、どの会社の分を見る・
 * 直すかをここで選ぶ。
 *
 * `LocationTabs.tsx`（料金表の場所タブ）のトーン・実装（`aria-pressed` のボタン列。
 * タブの ARIA は名乗らず `role="group"` にする理由も同じ — 矢印キー移動・
 * tabpanel を実装していない）を参考にしているが、**このページ専用に組んである**:
 * 「空の会社」という概念が無い（GJV/GSS/GMO の3社ぶんとも migration 286 で
 * 必ず設定が存在する）ため、コピー導線・空表示は持たない。
 *
 * 並び順は `GET /legal-entities` が返した順（`sort_order`）のまま描く
 * （呼び出し側で並べ替えない）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { LegalEntity, LegalEntityCode } from '../reorg/types';

export function MoneyRulesEntityTabs({
  entities, value, onChange,
}: {
  entities: LegalEntity[];
  value: LegalEntityCode;
  onChange: (code: LegalEntityCode) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="計上会社">
      {entities.map((e) => {
        const on = e.code === value;
        return (
          <button
            key={e.code}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(e.code)}
            className={cn(
              'rounded-control min-h-tap flex min-w-[8rem] flex-col items-start gap-0.5 border px-3.5 py-2 text-left lg:min-h-[48px]',
              on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
            )}
          >
            <span className="text-sub font-bold">{e.shortName}</span>
            {/* 案件番号の prefix — 「どの会社の帳簿か」を裏付ける小さな根拠 */}
            <span className={cn('font-number text-note', on ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
              {e.numberPrefix}
            </span>
          </button>
        );
      })}
    </div>
  );
}
