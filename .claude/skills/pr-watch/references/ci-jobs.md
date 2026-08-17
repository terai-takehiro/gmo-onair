# この製品の CI は2ジョブだけ（落ち方ごとの読み方と直し方）

必須チェックに指定されているジョブ名は **`checks` と `build`**（ASCII 固定。日本語にすると
ruleset 側で打ち間違えても**静かに「チェック無し」**になるため）。定義は
[.github/workflows/ci.yml](../../../../.github/workflows/ci.yml)。

**赤いジョブ名を見たら、まず下の表で「手元で何を叩けば同じものが再現するか」を確かめてください。**
CI のログを読む前に手元で再現したほうが速く、当てずっぽうの push が減ります。

## `checks`（型・lint・テスト・整合）

上から順に走り、**1つ落ちるとそこで止まります**（下の段は走りません＝「他は通った」と読まないこと）。

| CI の段 | 手元での再現 | 落ちたときに疑うこと |
| --- | --- | --- |
| 型チェック（**7クライアント + server**） | `npm run typecheck:all` | ⚠️ **手元の `npm run typecheck` は v4 の3アプリだけ**（速さのため）。`shared/` を触ったときは凍結4アプリの型が落ちるので、**必ず `:all` で確かめる** |
| Lint（eslint ＋ 検査10本） | `npm run lint` | 版の3か所を触っていないか（`check-changelog`）／トークンの段（`check-tokens`）／400行超（`check-file-size`）／行き先の無いリンク（`check-links`）／スマホの宣言漏れ（`check-mobile-declared`） |
| Test（shared の純関数） | `npm run test` | 画面のテストは無い。ここが落ちるのは**計算・規則・SQL の書き方の検査** |
| 共通コードの乖離 | `node scripts/check-collab-parity.mjs` | `shared/src/collab/` と `server/src/shared/collab/` は**意図的な2コピー**。片方だけ直した |
| バージョン表記の整合 | `npm run check:version` | `package.json` / `CLAUDE.md` / `README.md` の3か所がずれた。⚠️ **作業 PR では版を上げない**のが決めごとなので、ここが落ちたら「上げてしまった」ほうを戻す |
| UI トークン検査 | `npm run check:ui-tokens` | 記録（BASELINE）を**超えたときだけ**落ちる。既存の分は通る |

## `build`（Docker イメージ）

`docker build` を通すだけ（PR では push しない）。手元での近い再現は **`npm run build:all`**。

- **`tsc` が通っても Vite のバンドルで落ちることがある**ので、型チェックとは別に要ります
- Dockerfile は**7アプリすべてを個別ステージでビルド**します。手元の `npm run build` は
  3アプリだけなので、**凍結アプリのビルドが落ちるのはここで初めて分かります**
- 落ちたら、まず**どのステージか**をログで特定してから、そのワークスペースだけ
  `npm run build -w <ws>` で再現します

## ⚠️ CI が見ていないもの（緑を「全部確かめた」と読まないため）

**必須チェックが緑でも、次の3つは確かめられていません。** 触ったなら手元で回してください。

| 見ていないもの | 手元で回すもの | 見ないと何が起きるか |
| --- | --- | --- |
| **凍結4アプリの CSS が変わっていないか** | `npm run build:all` → `npm run check:frozen` | `shared/src/client/` にクラス名を1つ書くだけで凍結アプリの CSS が増えます（**コメントの中でも拾われます**。4回踏んでいる） |
| **シードが流れるか** | 新しい DB を作って `npm run db:seed` | **どちらのジョブもシードを流しません。** 壊れたシードは**検証環境（`SKIP_SEED=false`）で初めて落ち**、しかも途中まで入った状態で残ります（実際に #175 で踏んだ。[pitfalls.md](pitfalls.md)） |
| **実ブラウザでの見た目** | `npm run verify:ui` | 書体・桁揃い・横はみ出しは型でも lint でも出ません |

## ⚠️ 「門があるつもりで無かった」前例

`check-changelog.mjs` は `origin/main` と比べますが、`checkout` が**浅い clone** だったため
**`origin/main` がどの PR にも存在せず**、「読めなければ飛ばす」で**一度も動いていませんでした**
（版の3か所を書き換えても緑）。いまは `fetch-depth: 0` が入っており、**外すとまた黙ります**。

つまり **緑は「その検査が通った」ではなく「落ちなかった」**です。新しく門を足したときは、
**わざと落として落ちることを1度確かめる**のが、この製品での作法です。
