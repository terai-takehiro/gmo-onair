/**
 * 行ページの「情報」欄に並ぶ、親のデータベースの項目（設計 §6-⑩）
 *
 * > 行を押すとその行ページ（②と同じ画面。「情報」欄に項目の値が並ぶ）
 *
 * 担当・見直し予定・タグの下に、**親のデータベースで決めた順**に出します
 * （項目の並べ替えは表の列の順番でもあるので、同じ順に見えることが要ります）。
 *
 * ⚠️ **値の入力は表のセルと同じ部品（`DatabaseCell`）を使います。**
 *    同じ値を2か所（表と行ページ）で直せるので、別々に書くと片方だけ
 *    日本語入力が壊れる・片方だけ選択肢が出ない、という形になります。
 *
 * ⚠️ ここは**スマホでも直せます**（§6-⑩「値の編集はできる」）。
 *    PC に案内するのは並べ替え・項目の定義・ビューの追加だけです。
 */
import { Link } from 'react-router-dom';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import DatabaseCell from '@/components/database/DatabaseCell';
import { useOnairUsers } from '@/components/page/pageOpsApi';
import { useRowProps } from './useRowProps';

export interface RowPropsFieldsProps {
  page: WikiPage;
  /** 直せる人か（editor 以上）。持っていない人には読むだけの表示が出る */
  canEdit: boolean;
}

export default function RowPropsFields({ page, canEdit }: RowPropsFieldsProps) {
  const row = useRowProps(page);
  /*
   * 担当の型は id で持つので、**読むだけの人にも名前の一覧が要ります**
   * （無いと画面に id がそのまま出ます）。項目に「担当」が無ければ引きません。
   */
  const usersQ = useOnairUsers(row.items.some((i) => i.type === 'person'));

  // 親がデータベースでなければ、この欄ごと出さない（ふつうのページには関係がない）
  if (!row.parentId) return null;

  return (
    <div className="mt-2 border-t border-border-faint pt-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-th text-muted-foreground">データベースの項目</span>
        <Link
          to={`/p/${row.parentId}`}
          className="ml-auto min-w-0 truncate text-sub-sm text-primary no-underline hover:underline"
        >
          {row.parentTitle || 'データベースを開く'}
        </Link>
      </div>

      {row.items.length === 0 ? (
        <p className="text-sub-sm text-muted-foreground">
          {canEdit
            ? 'まだ項目がありません。データベースのページの「項目」から追加できます。'
            : 'まだ項目がありません。'}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {row.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2.5 py-1">
              <span className="w-[84px] shrink-0 pt-1 text-th text-muted-foreground">
                {item.name}
                {item.required && <span className="ml-1 text-sub-sm text-destructive">必須</span>}
              </span>
              <span className="min-w-0 flex-1 text-sub text-foreground">
                <DatabaseCell
                  item={item}
                  value={page.props?.[item.id]}
                  canEdit={canEdit}
                  people={usersQ.data}
                  busy={row.savingItemId === item.id}
                  onCommit={(value) => row.commit(item, value)}
                />
                {row.messages[item.id] && (
                  <span className="mt-1 block text-sub-sm text-destructive">
                    {row.messages[item.id]}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
