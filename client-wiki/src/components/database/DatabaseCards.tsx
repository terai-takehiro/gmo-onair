/**
 * 表のビュー（スマホ）— 1行を縦のカードにする
 *
 * 設計 §6-⑩「スマホ: 表は縦のカード。値の編集はできる」。
 * PC の表をそのまま縮めると 375px では1列も読めないので、
 * **列を横に並べるのをやめて、項目名と値を縦に積みます**（`_rules.md`「3. スマホ」）。
 */
import { Link } from 'react-router-dom';
import type { WikiItem, WikiPropValue, WikiRow } from '@gmo-onair/shared/src/wiki/types';
import DatabaseCell, { type CellPerson } from './DatabaseCell';

export interface DatabaseCardsProps {
  items: WikiItem[];
  rows: WikiRow[];
  canEdit: boolean;
  people?: CellPerson[];
  savingRowId?: string | null;
  onCommit: (row: WikiRow, item: WikiItem, value: WikiPropValue) => void;
}

export default function DatabaseCards({
  items, rows, canEdit, people, savingRowId, onCommit,
}: DatabaseCardsProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <article key={row.id} className="rounded-card border border-border bg-card p-3">
          <Link to={`/p/${row.id}`} className="no-underline">
            <h3 className="truncate text-list text-foreground">{row.title}</h3>
          </Link>
          {row.status === 'draft' && <p className="mt-0.5 text-sub-sm text-warning">下書き</p>}

          <dl className="mt-2 flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <dt className="w-[96px] shrink-0 truncate text-sub-sm text-muted-foreground">{item.name}</dt>
                <dd className="min-w-0 flex-1">
                  <DatabaseCell
                    item={item}
                    value={row.props?.[item.id]}
                    canEdit={canEdit}
                    people={people}
                    busy={savingRowId === row.id}
                    onCommit={(v) => onCommit(row, item, v)}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
