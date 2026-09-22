/**
 * 表のビュー（PC）— セルをその場で直せる
 *
 * ⚠️ **列が多いと必ず横に溢れます。** 溢れたときに動かすのは**この包みだけ**で、
 *    本文ごと横スクロールさせません（説明文まで横に流れると読めなくなる）。
 *    そのため表頭も行も `w-max min-w-full` の同じ包みの中に入れ、
 *    左右にスクロールしても列がそろったままにしてあります。
 *
 * 列の幅は共通の7段（`RowSlot` の `SlotWidth`）。型で決めているので、
 * 同じ「日付」の列がデータベースごとに違う幅になりません。
 */
import { Link } from 'react-router-dom';
import { Row, RowHeader, RowMain, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import type { WikiItem, WikiPropValue, WikiRow } from '@gmo-onair/shared/src/wiki/types';
import DatabaseCell, { type CellPerson } from './DatabaseCell';
import { itemWidth } from './dbValues';

/** タイトルの列。表頭と行で同じ幅にする（ここだけ伸びる子） */
const TITLE_CLASS = 'min-w-[240px] max-w-[240px]';

export interface DatabaseTableProps {
  items: WikiItem[];
  rows: WikiRow[];
  canEdit: boolean;
  people?: CellPerson[];
  /** 保存中の行（その行の入力を止める） */
  savingRowId?: string | null;
  onCommit: (row: WikiRow, item: WikiItem, value: WikiPropValue) => void;
}

export default function DatabaseTable({
  items, rows, canEdit, people, savingRowId, onCommit,
}: DatabaseTableProps) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <div className="w-max min-w-full">
        <RowHeader>
          <RowMain className={TITLE_CLASS}>タイトル</RowMain>
          {items.map((item) => (
            <RowSlot key={item.id} w={itemWidth(item.type)} placeholder="">
              <span className="truncate">{item.name}</span>
            </RowSlot>
          ))}
        </RowHeader>

        {rows.map((row) => (
          <Row key={row.id} density="table" divider align="center">
            <RowMain className={TITLE_CLASS}>
              <Link to={`/p/${row.id}`} className="no-underline">
                <RowTitle className="hover:text-primary">{row.title}</RowTitle>
              </Link>
              {row.status === 'draft' && (
                <span className="text-sub-sm text-warning">下書き</span>
              )}
            </RowMain>

            {items.map((item) => (
              <RowSlot key={item.id} w={itemWidth(item.type)} placeholder="">
                <DatabaseCell
                  item={item}
                  value={row.props?.[item.id]}
                  canEdit={canEdit}
                  people={people}
                  busy={savingRowId === row.id}
                  onCommit={(v) => onCommit(row, item, v)}
                />
              </RowSlot>
            ))}
          </Row>
        ))}
      </div>
    </div>
  );
}
