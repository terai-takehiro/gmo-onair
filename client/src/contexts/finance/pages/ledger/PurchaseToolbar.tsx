/**
 * ④ 仕入一覧の見出し右側の道具（Excel の取込・書き出し ＋ 按分グループへの導線）
 *
 * `PurchaseListPage.tsx` から切り出した（1ファイル400行の上限）。
 * 中身は元のまま——**Excel の取込・書き出しはスマホに出さない**（取り込みは台帳に
 * 行を入れる操作で、途中で止まると二重に入る＝取り消せない。ファイル選択そのものも
 * スマホでは実用にならない・`/budget/vendors` で落とした前例）。「按分グループ」は
 * スマホにも残す（行き先の一覧 `/sales/project-groups` はスマホで開ける画面なので
 * 行き止まりにならない。`/budget/vendors` の「仕入先集計」を落とした理由は
 * 行き先が PC 専用だったため）。
 */
import { Button } from '@/components/ui/button';
import ExcelToolbar from '@/components/ExcelToolbar';

export function PurchaseToolbar({
  isMobile, appliedSearch, filterProjectId, month, rangeFrom, rangeTo,
  fixedCost, state, entity, sort, onOpenProjectGroups,
}: {
  isMobile: boolean;
  appliedSearch: string;
  filterProjectId: string;
  month: string;
  rangeFrom: string | undefined;
  rangeTo: string | undefined;
  fixedCost: '0' | '1';
  state: string | undefined;
  entity: string;
  sort: string;
  onOpenProjectGroups: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {!isMobile && (
        <ExcelToolbar
          resource="/purchases"
          name="仕入"
          queryKey={['purchases-all']}
          hasDuplicateKey={false}
          exportParams={{
            search: appliedSearch || undefined,  // 画面の結果と書き出しの中身を揃える
            project_id: filterProjectId || undefined,
            recognition_month: month || undefined,
            recognition_from: rangeFrom,
            recognition_to: rangeTo,
            fixed_cost: fixedCost,
            state: state || undefined,
            entity_code: entity || undefined,
            // 画面の並び順のまま書き出す（渡さないとサーバー既定順に戻ってしまい、
            // 並べ替えたのに Excel だけ元の順で出るという食い違いになる）
            sort: sort || undefined,
          }}
        />
      )}
      {/*
        ⚠️ **`/project-groups` ではありません。** 案件管理の下（`/sales/…`）です。
        接頭辞の無い旧 URL はルート表に無く、`<Route path="*">` が拾って
        **黙ってホームに戻ります**（押しても何も起きないように見える）。
      */}
      <Button variant="outline" onClick={onOpenProjectGroups}>按分グループ</Button>
    </div>
  );
}
