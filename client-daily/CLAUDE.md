# client-daily — 日常業務（v4 対象）

ベースパス `/daily/`・ポート 5180。12画面・約5,800行。サーバー側は `server/src/contexts/dailyops`。

## 画面（v4 で6画面に整理）

| v4 画面 | いまの実装 |
| --- | --- |
| ウィークリー活動報告 | `pages/WeeklyListPage` / `WeeklyDetailPage` |
| デイリーニュース報告 | `pages/DailyNewsPage` |
| 内覧会 開催日の一覧 | `pages/InviewPage` |
| 内覧会 その日の受付 | `pages/InviewDayPage` ＋ `pages/inview/{shared.tsx,logic.ts}` |
| 入ってきた情報（その他問い合わせ） | `pages/InquiriesPage` |
| セキュリティカード | `pages/SecurityCardsPage` |

- `pages/TasksPage` は**案件管理へ寄せる**方針（v4 では `/daily/tasks` を案件管理のタスクへ転送）
- 左メニューは `src/components/layout/Sidebar.tsx`

## このアプリ固有の決めごと

- **ウィークリー活動報告**: 自動集計 → AI本文 → 人が書くトピック の3層。**確定後は追記不可**
- **デイリーニュース**: 日付ナビ・カテゴリ・AI活用・採用1〜5・記入者。採用を付けた行は週報のトピックへ送れる
- **内覧会**: 検索は**回をまたぐ**（申し込んだ回を覚えていない人が普通にいる）。
  正規化は NFKC → 小文字 → カタカナをひらがなへ → 区切り記号を落とす（`pages/inview/logic.ts`）。
  **同行者は1人ずつ受付**する（代表だけ先に来るのが普通）。受付人数は**組数ではなく人数**で数える
- **セキュリティカード**は機材の貸出とは**別台帳**（エリア解錠権限で分かれる。24枚・10エリア）
- **受け取った書類は財務管理へ移した**（v4 ⑥・`/budget/documents`）。`dailyops` 権限だけを
  要求していたので**経理が開けなかった**（実測で 403）。中身は 金額・締月・支払期日・GLS番号 で
  経理の道具なので財務に置き、**`budget` か `dailyops` のどちらか**で通す。
  `/daily/finance` は転送だけ残した（`App.tsx` の `RedirectToFinanceDocs`）。
  **左メニューとホームのタイルは消していない** — `dailyops` だけの人はアプリ切替に
  財務管理が出ないので、消すと辿り着く道が無くなる

## 触るときの注意

- **シェルは共通** (`shared/src/client/shell/`)。このアプリに残っているのは
  `components/layout/AppShell.tsx`（設定を渡すだけ）と `components/layout/nav.ts`（メニューの中身）。
  **旧 `Header.tsx` / `Sidebar.tsx` は削除済み**

- **1ファイル400行を上限にする。** いま `pages/TasksPage.tsx` が 1,005行
- `src/index.css` にタイマー・視聴者数のクラスが残っている（計時LIVE から流用された跡）。
  `switcher-in` の keyframes は `shared` のトークンと**重複定義**
- **`html`/`body`/`#root` はこのアプリで触らない。** 高さ・書体・印刷は
  `shared/src/client/base.css`（F2 で集約済み）。本文が 16px だったのもこれで揃った
- **`pages/FinanceDocsPage.tsx` は v4 の共通部品の実証台**（P2・P3）。
  中身が無いときは `Delayed`+`SkeletonRows` / `EmptyState` / `NoSearchResults`、
  削除の確認は `confirmAction`（`window.confirm` は使わない）、
  結果は `notifySuccess` / `notifyApiError`（`alert` は使わない）。
  行部品の使い方は次のとおり:
  一覧の行を書くときはここを写す:
  `<Row align="start" stackOnMobile>` ＋ `<RowSlot w={56} hideOnMobile>`（種別）
  ＋ `<TableBadge w={96}>`（ステータス）＋ `<RowMain>`（件名・本文）
  ＋ `<MoneyCell width={128}>`（金額）。**幅は7段（56/72/96/128/160/200/240）から選ぶ**
- **バッジの色は生の Tailwind パレット直書きが 49 か所**残っている
  （`shared/src/constants/statuses.ts` を通していない）。Phase 4 の作り直しでまとめる
