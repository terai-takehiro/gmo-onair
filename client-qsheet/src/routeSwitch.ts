/**
 * `/qsheet` を開いたときに何を出すか — **この1ファイルが切り替え点**。
 *
 * `/qsheet/home`（新しいトップ・案件を選ぶ）と `/qsheet/sheets`（旧トップ・
 * 進行台本の一覧）は**常に両方存在する**（どちらに倒しても片方が 404 にならない）。
 * `/qsheet` はどちらか一方への**転送だけ**を行い、画面そのものは置かない。
 *
 * 03-app-structure-impl.md §3-3:
 *   - 画面を `/qsheet` に直接置くと、切り替えのたびに `element` を入れ替える
 *     ことになり「1行」で済まなくなる
 *   - 転送は必ず1段にする（`*` の行き先も `/qsheet` ではなくここの値を直接見る）
 */
export type QsheetRoot = 'list' | 'home';

function resolveRoot(): QsheetRoot {
  // **切り替えるのはこの1行だけ**。利用者の確認（README §4 の確認13）が
  // 取れたら 'home' にする
  return 'list';
}

export const QSHEET_ROOT: QsheetRoot = resolveRoot();

/** `/qsheet` および転送の行き先（最終地）。**1段で着く形にする** */
export const QSHEET_ROOT_PATH: string = QSHEET_ROOT === 'home' ? '/qsheet/home' : '/qsheet/sheets';
