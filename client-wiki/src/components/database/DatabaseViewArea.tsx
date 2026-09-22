/**
 * ビューの中身（表／ボード／カレンダー）の出し分けと、読み込み・空のときの表示
 *
 * **3つのビューで同じ行を見ます**（絞り込みと並べ替えはサーバーが当てたもの）。
 * ここは「どの形で描くか」だけを決めます。
 */
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Table2 } from 'lucide-react';
import type { WikiItem, WikiPropValue, WikiRow, WikiView } from '@gmo-onair/shared/src/wiki/types';
import type { CellPerson } from './DatabaseCell';
import DatabaseBoard from './DatabaseBoard';
import DatabaseCalendar from './DatabaseCalendar';
import DatabaseCards from './DatabaseCards';
import DatabaseTable from './DatabaseTable';

export interface DatabaseViewAreaProps {
  view: WikiView;
  /** 表に出す列（ビューの `columns` を当てたあと） */
  columns: WikiItem[];
  /** 定義の全部（ボードのグループ・カレンダーの日付を引くのに使う） */
  items: WikiItem[];
  rows: WikiRow[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  canEdit: boolean;
  /** スマホでは表を縦のカードにする（設計 §6-⑩） */
  mobile: boolean;
  people?: CellPerson[];
  savingRowId: string | null;
  onCommit: (row: WikiRow, item: WikiItem, value: WikiPropValue) => void;
  onMoveGroup: (row: WikiRow, value: string | null) => void;
}

export default function DatabaseViewArea({
  view, columns, items, rows, loading, error, onRetry,
  canEdit, mobile, people, savingRowId, onCommit, onMoveGroup,
}: DatabaseViewAreaProps) {
  if (error) {
    return <ErrorPanel title="行を読み込めませんでした" error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return <Delayed><SkeletonRows rows={6} rowHeight={40} /></Delayed>;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Table2 />}
        title="まだ行がありません"
        description={canEdit
          ? '上の入力欄にタイトルを入れて「行を追加」を押すと、この下に並びます（行はこのページの子ページになります）。'
          : '行を追加できるのは編集権限のある人です。'}
      />
    );
  }

  if (view.type === 'board') {
    return (
      <DatabaseBoard
        items={columns}
        rows={rows}
        groupItem={items.find((it) => it.id === view.groupBy && it.type === 'select') ?? null}
        canEdit={canEdit}
        savingRowId={savingRowId}
        onMove={onMoveGroup}
      />
    );
  }

  if (view.type === 'calendar') {
    return (
      <DatabaseCalendar
        rows={rows}
        dateItem={items.find((it) => it.id === view.dateItem && it.type === 'date') ?? null}
      />
    );
  }

  return mobile ? (
    <DatabaseCards
      items={columns}
      rows={rows}
      canEdit={canEdit}
      people={people}
      savingRowId={savingRowId}
      onCommit={onCommit}
    />
  ) : (
    <DatabaseTable
      items={columns}
      rows={rows}
      canEdit={canEdit}
      people={people}
      savingRowId={savingRowId}
      onCommit={onCommit}
    />
  );
}
