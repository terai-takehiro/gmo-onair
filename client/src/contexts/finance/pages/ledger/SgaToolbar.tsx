/**
 * ⑤ 販管費一覧の見出し右側の道具（Excel の取込・書き出し）
 *
 * `SgaListPage.tsx` から切り出した（1ファイル400行の上限）。中身は元のまま——
 * **Excel の取込・書き出しはスマホに出さない**（取り込みは台帳に行を入れる操作で、
 * 途中で止まると二重に入る＝取り消せない。ファイル選択そのものもスマホでは
 * 実用にならない・`/budget/vendors` で落とした前例）。
 */
import ExcelToolbar from '@/components/ExcelToolbar';

export function SgaToolbar({
  isMobile, appliedSearch, source, expenseType, accountTitleId,
  month, rangeFrom, rangeTo, entity, sort,
}: {
  isMobile: boolean;
  appliedSearch: string;
  source: string | undefined;
  expenseType: string | undefined;
  accountTitleId: string;
  month: string;
  rangeFrom: string | undefined;
  rangeTo: string | undefined;
  entity: string;
  sort: string;
}) {
  if (isMobile) return null;
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <ExcelToolbar
        resource="/sga-expenses"
        name="販管費"
        queryKey={['sga-list']}
        hasDuplicateKey={false}
        exportParams={{
          search: appliedSearch || undefined,  // 画面の結果と書き出しの中身を揃える
          source: source || undefined,
          expense_type: expenseType || undefined,
          account_title_id: accountTitleId || undefined,  // 科目で絞ったまま書き出す
          recognition_month: month || undefined,
          recognition_from: rangeFrom,
          recognition_to: rangeTo,
          entity_code: entity || undefined,
          // 画面の並び順のまま書き出す（渡さないと並べ替えたのに Excel だけ元の順で出る）
          sort: sort || undefined,
        }}
      />
    </div>
  );
}
