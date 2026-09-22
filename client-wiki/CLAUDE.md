# client-wiki — Wiki（ブロックアプリ）

Markdown で書いた文章をツリーに並べ、検索できて、AI が読める場所。
**設計の正は [docs/design/v4/wiki.md](../docs/design/v4/wiki.md)**（665行・§9 に作る順）。
モックの正は [docs/design/v4/mockups/native/wiki/](../docs/design/v4/mockups/native/wiki/)。

| | |
| --- | --- |
| ベースパス | `/wiki/`（`vite.config.ts` の `base`・`App.tsx` の `basename`） |
| 開発ポート | **5181** |
| 権限の区分 | `wiki`（`usePermissions.ts`。閲覧は全員の既定） |
| `apps.ts` の key | `wiki` |

## いまどこまで作ってあるか（段A＝読むだけ）

| 画面 | ルート | 中身 |
| --- | --- | --- |
| ホーム | `/` | 要見直しの案内・スペースのタイル・最近更新・お気に入り |
| スペース | `/s/:key` | 中央＝直下のページの一覧（ツリーは共通の左メニューの中） |
| ページ | `/p/:id` | 中央＝本文（Markdown）。ツリーは共通の左メニューの中・情報は右パネル（開閉式・既定は閉じ） |
| 履歴 | `/p/:id/history` | 版の一覧と2つの版の違い（**PC の画面**） |

**まだ無いもの**: 編集（段B）・データベース（段C）・検索（段D）・AI に聞く（段E）・
見直しとコメント（段F）。書き込みの口は1つも呼んでいない。

### 作っていない画面への入口は出さない

左メニュー（`components/layout/nav.ts`）には §6-① の項目が**全部データとして書いてある**が、
画面がまだ無いものには `ready: false` が立っていて、シェルに渡す前に外している。
ホームの検索欄と「AI に聞く」も同じ理由で出していない。

> 押せるのに何も出ない項目は、利用者には「壊れている」としか見えない。
> 設計書も「段E までは『準備中』ではなく**出さない**」と決めている（§6-①）。

段D・段E・段F でその画面を作ったら、**`ready: true` に変えるだけ**でよい。

## このアプリだけの決めごと

### 本文の描き方（`components/wiki/WikiMarkdown.tsx`）

- **HTML は描かない。** `rehype-raw` を入れない。本文に `<script>` や `<img onerror=…>` が
  混ざっても文字として出るだけ（react-markdown の既定）。**この既定を外さないこと**
  （§7-5「AI に HTML を書かせない」。AI が書いた本文も人の本文も同じここを通る）
- 拡張は設計書 §4-2 の2つだけ: **注意書き**（`> [!NOTE]` `[!TIP]` `[!WARNING]` `[!CAUTION]`）と
  **ONAiR カード**（段落がリンク1本だけのとき）。表に無いブロックを増やさない
- **目次と本文の見出しは同じ `extractHeadings`（shared）から作る。** 別々に作ると
  目次を押しても飛べない
- **react-markdown の custom component では `node` を必ず受け取って捨てる。**
  `...rest` に残して DOM へ渡すと `<table node="[object Object]">` という属性が本当に出る（踏んだ）
- 注意書きの中身は「描かれたあとの要素」ではなく**元の文字列を行で切り出して**作る
  （`components/wiki/markdownSource.ts`）。`[!NOTE]` の印を落とすのに、強調やリンクが
  混ざった要素から文字を拾うやり方は壊れる
- **折りたたみ（`<details><summary>`）も同じ作法**（`splitFolds` ＋ `WikiFold`）。
  `rehype-raw` を入れていない以上、生の HTML は描かれずに**落ちる**ので、元の文字列から
  形を見つけて自前の部品で描く。⚠️ **閉じ（`</details>`）が無い開きは切り分けない** —
  書きかけの本文を全部畳んでしまうと、保存はできているのに画面から消えて見える
  （`shared/tests/wikiFoldSplit.test.ts` が固定している）

### 本文の書体

**14px / 行間 1.85**（`src/index.css` の `.wiki-doc`。モック `Page.dc.html` の実測値）。
一覧の 13.5px より一段大きいのは、Wiki が**読むためのアプリ**で、長文を最後まで追えることを
一覧の情報密度より優先するため。react-markdown が作る `<p>` `<h2>` に class を付けられないので、
ここだけ素の CSS で書いてある（色はすべて共通トークンを参照）。

### ナビの列は1本だけ（2026-09-22 に作り直した）

最初は「共通の左メニュー 248px ＋ Wiki のツリー 264px ＋ 本文 ＋ 情報 320px」の**4列**で、
1440px の本文が **608px** しか残らなかった。利用者からのご指摘（「サイドタブが増えすぎて
すごく窮屈」）で2つ直した。

1. **ツリーは共通の左メニューの中に出す。** `components/layout/WikiSpaceTreePanel.tsx` を
   `useSideMenuTopSlot()`（`shared/src/client/shell/sideMenuSlot.ts`）へ `createPortal` する。
   予定のミニカレンダーと同じ先例。**画面の中に2本目のナビの列を作らない**
2. **右の情報パネルは開閉式で、既定は閉じ。** 閉じている間は目次と情報を本文の下に続けるので、
   どちらの状態でも情報に辿り着ける。開閉は端末に覚える（`gmo_onair_wiki_info_open`）

実測（ページ②）: 1440px で 閉じ=860px（最大幅）／開き=792px。1280px で 閉じ=860px／開き=632px。

**スマホでツリーを開くのは上辺バーの `☰`（共通メニューの引き出し）だけ。**
画面の中にもう1つ `☰` を置かない（同じものを開くボタンが横に2つ並ぶ）。

### `PageShell` を使っていない画面がある

`/p/:id`・`/s/:key`・`/p/:id/history` は3列を画面の端まで使う（モックがそう）。
`PageShell` の余白を入れると寸法が合わないので使っていない。ホーム（`/`）は使っている。

### 列の出し分けは CSS でやる

`useIsMobile()` で早い段階に `return` しない（幅が変わるとフックの数が変わって落ちる）。
右パネルは `hidden xl:flex` で出し分け、情報と目次はパネルを閉じている間と
パネルを出せない幅では本文の下に積む。

### API の URL は `lib/wikiApi.ts` の `WIKI_URL` に集める

サーバーと突き合わせる場所を1つにしてある。画面のあちこちに URL の文字列を撒かない。

### 問い合わせは区画ごとに諦められるようにする

ホームの最近更新・お気に入り・要見直しは別々の問い合わせで、失敗してもその区画の中だけで
受ける（1つの 404 でホーム全体が白紙にならない）。要見直しの案内は**0件・読み込み中・
失敗のとき何も出さない** — 開くたびに場所だけ取る空の案内が出ると下の一覧の位置がずれる。

## 部品の置き場

| どこ | 何 |
| --- | --- |
| `components/wiki/` | このアプリの部品（`WikiMarkdown` `WikiAlert` `WikiOnairCard` `WikiTree` `WikiToc` `WikiStatusBadge` `WikiSection` `PageBriefRow`） |
| `components/ui/` | shared の再エクスポート1行だけ（実体を2つ作らない） |
| `lib/` | `wikiApi`（URL と react-query）`wikiFormat`（第N版・見直し予定）`wikiTree`（ツリーの組み立て）`lineDiff`（版の差分） |
| `pages/` | 画面。`home/` `page/` `history/` |

画面に使う共通部品・トークン・シェルの正は [`shared/CLAUDE.md`](../shared/CLAUDE.md)。

## 検査

```bash
npx tsc -b client-wiki
npx eslint client-wiki
npm run build -w client-wiki
npm run lint          # check-shared-wiring / check-mobile-declared / check-ui-tokens / check-file-size ほか
```

- **`src/pcOnlyScreens.ts` の2つの表は `App.tsx` のルートと1対1**（`check-mobile-declared.mjs`）。
  ルートを足したらどちらかに必ず宣言する
- 文言は [docs/wording.md](../docs/wording.md)。特に**ルール11**（開発文書の比喩語を画面に出さない。
  道具・決めごと・棚・札・帯・木・種・口・手つき・作法 → アプリ／ルール／区分／表示／バナー／
  ツリー／候補／リンク／操作）
