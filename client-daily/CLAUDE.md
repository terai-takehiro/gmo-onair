# client-daily — 日常業務（v4 対象）

ベースパス `/daily/`・ポート 5180。12画面・約5,800行。サーバー側は `server/src/contexts/dailyops`。

## 画面（v4 で6画面に整理）

| v4 画面 | いまの実装 |
| --- | --- |
| ウィークリー活動報告 | `pages/WeeklyListPage` / `WeeklyDetailPage` |
| デイリーニュース報告 | `pages/DailyNewsPage` |
| 内覧会 開催日の一覧 | `pages/InviewPage` |
| 内覧会 その日の受付 | `pages/InviewDayPage` ＋ `pages/inview/{shared.tsx,logic.ts}` |
| 入ってきた情報（届いた見積・請求書 ＋ その他問い合わせ） | `pages/FinanceDocsPage` ＋ `pages/InquiriesPage` |
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
- **受け取った書類**（届いた見積・請求書）は自社が出す請求（財務管理）とは別物。
  承認後に「財務管理へ渡す」で仕入／販管費の下書きになる一本道

## 触るときの注意

- **1ファイル400行を上限にする。** いま `pages/TasksPage.tsx` が 1,005行
- `src/index.css` にタイマー・視聴者数のクラスが残っている（計時LIVE から流用された跡）。
  `switcher-in` の keyframes は `shared` のトークンと**重複定義**
- 本文の文字サイズが `client` と揃っていない（`index.css` の `@layer base` に
  `font-size`/`line-height`/`letter-spacing` が無い）→ v4 の F2 で共通の下地に寄せる
