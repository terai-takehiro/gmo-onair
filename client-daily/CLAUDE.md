# client-daily — 日常業務（v4 対象）

ベースパス `/daily/`・ポート 5180。12画面・約5,800行。サーバー側は `server/src/contexts/dailyops`。

## 画面（v4 で6画面に整理）

| v4 画面 | いまの実装 |
| --- | --- |
| ウィークリー活動報告 | `pages/WeeklyDetailPage`（**1画面 master-detail**）＋ `pages/weekly/{WeekRail,StatsSection,TopicsSection}.tsx`。`pages/WeeklyListPage` は `/weekly` → 最新週への転送だけ |
| デイリーニュース報告 | `pages/DailyNewsPage` ＋ `pages/news/{NewsRows,NewsForm}.tsx` |
| 内覧会 開催日の一覧 | `pages/InviewPage` |
| 内覧会 その日の受付 | `pages/InviewDayPage` ＋ `pages/inview/{AttendeeCard,InviewDialog,CompanySummary}.tsx` ＋ `pages/inview/logic.ts` |
| 入ってきた情報（その他問い合わせ） | `pages/InquiriesPage` |
| セキュリティカード | `pages/SecurityCardsPage`（**master-detail**）＋ `pages/securityCards/{CardGrid,CardDetailPanel,LendDialog,types}.tsx` |

- `pages/TasksPage` は**案件管理へ寄せる**方針（v4 では `/daily/tasks` を案件管理のタスクへ転送）。
  いまは**そのまま残している** — 案件管理の `contexts/tasks/components/MyTasksSummarySection.tsx`
  からここへ来る導線があり、先に消すと切れる
- 左メニューの中身は `src/components/layout/nav.ts`（枠は共通シェル）。
  **3つの塊**（定期報告 / 届いたもの / 現場の受付）＋ ホームとタスク

## このアプリ固有の決めごと

- **ウィークリー活動報告**: 自動集計 → AI本文 → 人が書くトピック の3層。**確定後は追記不可**
- **デイリーニュース**: 日付ナビ・分類・AI活用・採用1〜5・記入者。
  **採用した行を週報へ送る仕組みは無い**（サーバーに口が無く、由来を残す列も無い）。
  モックにはボタンがあるが**出していない** — 押しても何も起きないものを置かない
- **内覧会**: 検索は**回をまたぐ**（申し込んだ回を覚えていない人が普通にいる）。
  正規化は NFKC → 小文字 → カタカナをひらがなへ → 区切り記号を落とす（`pages/inview/logic.ts`）。
  **同行者は1人ずつ受付**する（代表だけ先に来るのが普通）。受付人数は**組数ではなく人数**で数える
- **セキュリティカード**は機材の貸出とは**別台帳**（エリア解錠権限で分かれる。24枚・10エリア）。
  **レベルは DB（migration 133 の6つ: master / room_a / room_b / room_c / meeting / vip）が正**。
  v4 のモックはレベルを3つに畳んでいるが**実データと一致しないので採らない**
  （畳むと ROOM A と ROOM B のカードが同じに見え、違う部屋のカードを渡す）。
  絞り込みの「返却遅延」は**「貸出中」の一部**（足しても「すべて」にならない）
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
- **一覧の行を書くときは `pages/InviewPage.tsx` の `DayRow` を写す。**
  `<Row divider interactive>` ＋ `<RowMain>`（唯一伸びる列）＋ `<RowSlot w={…}>`。
  **幅は7段（56/72/96/128/160/200/240）から選ぶ**。中身が無いときは
  `Delayed`+`SkeletonRows` / `EmptyState` / `NoSearchResults`、削除の確認は
  `confirmAction`（`window.confirm` は使わない）、結果は `notifySuccess` /
  `notifyApiError`（`alert` は使わない）
- **行ぜんぶをリンクにするときは `stackOnMobile` を使わない。**
  あれは `Row` の**直接の子**の `RowMain` を狙うので、間に `<Link>` が挟まると効かない。
  畳む列は `hideOnMobile`、落とした数字は `RowSub` に出す
- **`TableBadge` は折り返さない。** 長くなりうる文字（回の対象・週次トピックスの分類）は
  バッジにせず、`truncate` した文字で出す（バッジにすると列をはみ出して隣に重なる）
