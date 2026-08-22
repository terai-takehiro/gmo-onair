/**
 * `/qsheet` を開いたときに何を出すか — **この1ファイルが切り替え点**。
 *
 * `/qsheet/top`（アプリ全体のトップ・ミニアプリのタイル）・`/qsheet/home`
 * （進行台本の案件選択）・`/qsheet/sheets`（進行台本の一覧）は
 * **常に3つとも存在する**（どれに倒しても他が 404 にならない）。
 * `/qsheet` はどれか1つへの**転送だけ**を行い、画面そのものは置かない。
 *
 * 03-app-structure-impl.md §3-3:
 *   - 画面を `/qsheet` に直接置くと、切り替えのたびに `element` を入れ替える
 *     ことになり「1行」で済まなくなる
 *   - 転送は必ず1段にする（`*` の行き先も `/qsheet` ではなくここの値を直接見る）
 *
 * ⚠️ **2026-08-22（ご指摘）: 既定を `'top'` にした。** 当初は `'list'`（進行台本の一覧）
 * と `'home'`（進行台本の案件選択）の二択で、`'home'` への切り替えは
 * 「`/qsheet` というブックマークの意味が変わる」ため利用者確認待ち（README §4 確認13）
 * としていた。その後「このアプリにはミニアプリが複数ある（進行台本はその1つ）」と
 * 分かり、`/qsheet/top`（アプリ全体のトップ・`ProductionTopPage.tsx`）を新設した。
 * これは確認13が想定していた二択のどちらでもない**第三の答え**で、利用者から
 * 直接の指示を受けたためこの回で `'top'` に倒した。`'list'`/`'home'` は後方互換の
 * ため引き続き選べる（旧ブックマーク `/qsheet/sheets` `/qsheet/home` はどちらも生きている）。
 */
export type QsheetRoot = 'list' | 'home' | 'top';

function resolveRoot(): QsheetRoot {
  // **切り替えるのはこの1行だけ**。
  return 'top';
}

export const QSHEET_ROOT: QsheetRoot = resolveRoot();

/** `/qsheet` および転送の行き先（最終地）。**1段で着く形にする** */
export const QSHEET_ROOT_PATH: string =
  QSHEET_ROOT === 'top' ? '/qsheet/top' : QSHEET_ROOT === 'home' ? '/qsheet/home' : '/qsheet/sheets';
