/**
 * `/techops` を開いたときに何を出すか — **この1ファイルが切り替え点**。
 *
 * `/techops/top`（アプリ全体のトップ・ミニアプリのタイル）・`/techops/home`
 * （進行台本の案件選択）・`/techops/sheets`（進行台本の一覧）は
 * **常に3つとも存在する**（どれに倒しても他が 404 にならない）。
 * `/techops` はどれか1つへの**転送だけ**を行い、画面そのものは置かない。
 *
 * 03-app-structure-impl.md §3-3:
 *   - 画面を `/techops` に直接置くと、切り替えのたびに `element` を入れ替える
 *     ことになり「1行」で済まなくなる
 *   - 転送は必ず1段にする（`*` の行き先も `/techops` ではなくここの値を直接見る）
 *
 * ⚠️ **2026-08-22（ご指摘）: 既定を `'top'` にした。** 当初は `'list'`（進行台本の一覧）
 * と `'home'`（進行台本の案件選択）の二択で、`'home'` への切り替えは
 * 「`/qsheet` というブックマークの意味が変わる」ため利用者確認待ち（README §4 確認13）
 * としていた。その後「このアプリにはミニアプリが複数ある（進行台本はその1つ）」と
 * 分かり、`/qsheet/top`（アプリ全体のトップ・`ProductionTopPage.tsx`）を新設した。
 * これは確認13が想定していた二択のどちらでもない**第三の答え**で、利用者から
 * 直接の指示を受けたためこの回で `'top'` に倒した。`'list'`/`'home'` は後方互換の
 * ため引き続き選べる（旧ブックマーク `/qsheet/sheets` `/qsheet/home` はどちらも生きている）。
 *
 * ⚠️ **2026-08-22（qsheet→techops移行 Phase 2）: ベースパスを `/qsheet/` から
 * `/techops/` に変更した。** 旧 `/qsheet/*` は `App.tsx` で全ルート後方互換の
 * リダイレクト（クエリ文字列を維持）にしてあるため、既存のブックマーク・QR・
 * OBSブラウザソースURLはそのまま動く。識別子名（`QsheetRoot`→`TechopsRoot`等）も
 * ディレクトリ名（Phase 1）と揃えて改名した。
 */
export type TechopsRoot = 'list' | 'home' | 'top';

function resolveRoot(): TechopsRoot {
  // **切り替えるのはこの1行だけ**。
  return 'top';
}

export const TECHOPS_ROOT: TechopsRoot = resolveRoot();

/** `/techops` および転送の行き先（最終地）。**1段で着く形にする** */
export const TECHOPS_ROOT_PATH: string =
  TECHOPS_ROOT === 'top' ? '/techops/top' : TECHOPS_ROOT === 'home' ? '/techops/home' : '/techops/sheets';
