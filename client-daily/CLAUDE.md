# client-daily — 日常業務（v4 対象）

ベースパス `/daily/`・ポート 5180。12画面・約5,800行。サーバー側は `server/src/contexts/dailyops`。

## 画面（v4 で6画面に整理）

| v4 画面 | いまの実装 |
| --- | --- |
| ウィークリー活動報告 | `pages/WeeklyDetailPage`（**1画面 master-detail**）＋ `pages/weekly/{WeekRail,StatsSection,TopicsSection,WeeklyTabs}.tsx`。`pages/WeeklyListPage` は `/weekly` → 最新週への転送だけ。**タブが3つ**: この週の報告（`/weekly/:id`）／隔週キープの数字（`/weekly/:id/keep`・`pages/weekly/keep/`）／資料をつくる（`/weekly/:id/deck`・`pages/weekly/deck/`・**PC 専用**） |
| デイリーニュース報告 | `pages/DailyNewsPage` ＋ `pages/news/{NewsRows,NewsForm}.tsx` |
| 内覧会 開催日の一覧 | `pages/InviewPage` |
| 内覧会 その日の受付 | `pages/InviewDayPage` ＋ `pages/inview/{AttendeeCard,InviewDialog,CompanySummary}.tsx` ＋ `pages/inview/logic.ts` |
| 入ってきた情報（その他問い合わせ） | `pages/InquiriesPage` ＋ `pages/inquiries/{state.ts,InquiryRows,InquiryCards,SidePanels,TicketDialog,StockDialog,InquiryDialog,InquiryBody}.tsx` |
| セキュリティカード | `pages/SecurityCardsPage`（**master-detail**）＋ `pages/securityCards/{CardGrid,CardDetailPanel,LendDialog,types}.tsx` |

- `pages/TasksPage` は当初「案件管理へ寄せる」方針だったが、**この方針は撤回した**
  （案件管理側のトップページ節を参照）。⚠️ **この段落は当時の記録。**
  ここが根拠にしていた `MyTasksSummarySection.tsx` は「案件管理のリンクを全部当たり直し、
  v3 の置き土産を落とした回」で**参照 0 件のまま既に削除済み**だった（旧トップページの
  1,273 行を 177 行に作り直したときに呼び手が消えていた）。その後の回で、
  トップページの「わたしのタスク」の「全部ひらく」が案件管理の GLS-A タスク一覧
  （個人タスク・プロジェクト管理のタスクを含まない）に誤って固定リンクしている
  バグが見つかり、**このアプリの `TasksPage`（`GET /dailyops/tasks/mine` を
  そのまま出す唯一の画面）へ向け直した**。つまり `/daily/tasks` は転送先ではなく
  **行き先そのもの**になっており、この画面を消してはいけない
- 左メニューの中身は `src/components/layout/nav.ts`（枠は共通シェル）。
  **3つの塊**（定期報告 / 届いたもの / 現場の受付）＋ ホームとタスク

## このアプリ固有の決めごと

- **ウィークリー活動報告**: 自動集計 → AI本文 → 人が書くトピック の3層。**確定後は追記不可**。
  AI本文は画面の「AI下書きを作る」ボタン（`POST /dailyops/reports/:id/draft-ai`・
  `weekly-report-ai.service.ts`／`weekly-report-draft.service.ts`）で**その場で**作れる
  （2026-09。以前は MCP を AI エージェントが自発的に叩く想定だったが、実際にそれを
  週明けに起動するトリガーがどこにも無かった）。確定前だけ本文を直せる
  （`PUT /dailyops/reports/:id`）— 確定時にサーバーが AI 下書きと確定本文を自動比較して
  `ai_corrections` に記録する（会社方針「AIを使い捨てにしない」条件2）
- **隔週キープ（業績報告）はこの画面のタブ**（設計の正は [docs/design/v4/keep-report.md](../docs/design/v4/keep-report.md)）。
  - **数字は1本の「定例報告パック」**（`GET /dailyops/keep/pack?meeting=&entity_code=&segment=`・
    型は `shared/src/keepReport/types.ts`）。画面・資料・MCP はこれを読むだけで、
    **判定・比率・差はサーバーが計算する**（画面で足し引きしない）
  - **週報を確定すると、その週の会議日のパックも凍る**（`ops_reports.payload.keep = { pack_id, meeting_date }`・
    `keep_report_packs`）。画面は凍結版があればそれを出し、`?live=1` でいまの数字に切り替える
  - **フィルタは URL**（`?meeting=&entity_code=&segment=`。`entity_code` は main の計上会社
    GJV／GSS／GMO か `all`）。計上会社・お客様区分はヨミ表・案件ページ・実施報告だけに効き、
    数値報告の表は常に 全体／計上会社別 を持つ
  - **稼働率**: 内覧・仮押さえを含め利用があった営業日 ÷ 営業日。メンテナンスは除く。数え方は
    案件管理の設定「お金のルール」（`keep_settings.utilization`）
  - **「資料」の印**（ヨミ表のチェック＝`projects.keep_pick`）を付けた案件だけ資料の案件ページになる。
    案件管理のふりかえりタブと同じ値
  - **ONAiR に無い数字**（内覧会の満足度など）は `keep_report_inputs` に手入力（画面の欄から `PUT /dailyops/keep/inputs/:meeting`）
  - **「Slack の文面をコピー」**はパックから決定的に作った文（`GET /dailyops/keep/slack-draft`・MCP `get_keep_slack_draft`）。
    bot が投稿するときは Slack の `ts` と `pack_id` を残す（反応の回収 ＝ 原則の条件3）
  - **資料をつくる**は PC 専用（`DAILY_PC_ONLY`）。構成 JSON（`keep_decks`）は保存のたびに版を残し、
    人の直しは `keep_deck_edits` に差分で残る（原則「AIを使い捨てにしない」の器）。
    スライドの骨組みは `shared/src/keepReport/templates.ts` が正で、画面のプレビューと pptx 出力が同じ位置で描く
- **デイリーニュース**: **v4.5.26 で日別ページ→月ごとの1ページ集約に作り替えた**（日付は表の中の
  見出し行）。列は分類・AIの話題・注目度(1〜5)・記入者。「確認した」はレポート単位（＝日ごと）の
  まま見出し行に残した。**採用した行を週報へ送る仕組みがある**（migration 167・
  `POST /items/:itemId/to-weekly`）——移すのではなく写す（ニュースはその日の記録として残る）。
  送り先の週が確定済みかは月をまたぐと行ごとに違うため、`GET /dailyops/reports/items-by-month`
  がサーバー側で行ごとに `weekly_locked` を計算して返す（ページ単位の1つの値では表せない）
  ⚠️ 旧文言「採用した行を週報へ送る仕組みは無い」は migration 167 で実装済みになっていた
  ままの古い記述だった（レビュー指摘で判明・削除）
- **内覧会**: 検索は**回をまたぐ**（申し込んだ回を覚えていない人が普通にいる）。
  正規化は NFKC → 小文字 → カタカナをひらがなへ → 区切り記号を落とす（`pages/inview/logic.ts`）。
  **同行者は1人ずつ受付**する（代表だけ先に来るのが普通）。受付人数は**組数ではなく人数**で数える
- **入ってきた情報**は「**未仕分けを空にする机**」（migration 171 / 247）。
  - **タブは3つ**（今日さばくもの / ストック / 仕分け済み）。**`state` は5つのまま**で、
    変えたのは見せ方だけ。以前は5タブで**うち4つが「受領証」**（チケット・案件にした・
    見送りは「未仕分けに戻す」しかできない）で、片づいたものの棚が3つに割れていた
  - **「今日さばくもの」= 未仕分け ＋ 見直しの日が来たストック。**
    ⚠️ **「ストック」タブと重なる**ので、タブの件数を足しても全件にならない
    （セキュリティカードの「返却遅延は貸出中の一部」と同じ）
  - **ストックには見直す日（`stock_review_on`・migration 247）が要る。**
    これが無いとストックは見送りと同じ（どちらも未仕分けから消えて二度と出てこない）。
    **日を決めていないストックも机に出す** — 「決めていない」を「永久に出さない」と
    読むと元の行き止まりに戻る。判定は `shared/src/utils/inboxDesk.ts` の
    `isStockReviewDue()` が正で、サーバーは同じ条件を SQL で書いている（**片方だけ直さない**）
  - **一覧は上限つき**（既定50・最大200）。**件数は `GET /dailyops/inquiries/counts` が
    COUNT で数える** — 運んだ行を数えると上限で切れた分だけ嘘になる
  - **出どころ別・よく使うタグは、中身があるときだけ枠を出す。**
    本番のメール取込は `source`/`tags` をまだ渡していない（docs/mcp-server.md）ので、
    枠を出すと「メールだけ・他は0」と「まだタグが付いていません」で右半分が埋まる
  - **PC 専用ではない**（247 で外した）。スマホは表を折り返さず
    `inquiries/InquiryCards.tsx` の2行カード（PC の行は `InquiryRows.tsx`・**props は共通**）

  - **正は `state` の1本**（未仕分け / ストック / チケット / 案件にした / 見送り）。
    `handled_at` は「誰がいつ触ったか」の記録として残っているが、**絞り込みには使わない**
    （両方で絞れるようにすると片方だけ動いた行が一覧から消える）
  - **チケット = 案件管理のタスク。** `project_tasks` を1本作り（`project_id` は空・
    `source='inquiry'` / `source_ref=<情報の id>`）、`misc_inquiries.task_id` で結ぶ。
    **2回押しても増えない**（既にあればそれを返す）
  - **案件はこの画面では作らない。** `/sales/projects/new?inquiry=<id>` へ送り、
    案件管理の登録モーダルが作ってから `POST /dailyops/inquiries/:id/link-project` で
    書き戻す。写しの登録画面を作ると必須項目が片方だけ増えて食い違う
  - **モックのタブは4つだが5つにしてある。** 「案件の受付へ送る」の置き場が無く、
    そのままだと送ったものが未仕分けに残り続け、**翌日また送って案件が2件できる**。
    理由は `pages/inquiries/state.ts` の冒頭
  - **チケット・案件から戻しても、作ったタスク・案件は消さない。** 結びつきだけ外す
  - **AI の印は `source` では判定しない。** `ai_outputs`(kind=`inquiry_intake`) に
    記録があるかで決める（`source` は出どころで、誰が入れたかではない）
  - **タグの件数はサーバーが数える**（`GET /dailyops/inquiries/tags`）。
    画面で数えるとタブを切り替えるたびに同じタグの件数が変わる
- **セキュリティカード**は機材の貸出とは**別台帳**（エリア解錠権限で分かれる。24枚・10エリア）。
  **レベルは DB（migration 133 の6つ: master / room_a / room_b / room_c / meeting / vip）が正**。
  v4 のモックはレベルを3つに畳んでいるが**実データと一致しないので採らない**
  （畳むと ROOM A と ROOM B のカードが同じに見え、違う部屋のカードを渡す）。
  絞り込みの「返却遅延」は**「貸出中」の一部**（足しても「すべて」にならない）
- **受領書類は財務管理へ移した**（v4 ⑥・`/budget/documents`）。`dailyops` 権限だけを
  要求していたので**経理が開けなかった**（実測で 403）。中身は 金額・締月・支払期日・GLS番号 で
  経理の道具なので財務に置き、**`budget` か `dailyops` のどちらか**で通す。
  `/daily/finance` は転送だけ残した（`App.tsx` の `RedirectToFinanceDocs`）。
  **左メニューとホームのタイルは消していない** — `dailyops` だけの人はアプリ切替に
  財務管理が出ないので、消すと辿り着く道が無くなる

## 触るときの注意

- **シェルは共通** (`shared/src/client/shell/`)。このアプリに残っているのは
  `components/layout/AppShell.tsx`（設定を渡すだけ）と `components/layout/nav.ts`（メニューの中身）。
  **旧 `Header.tsx` / `Sidebar.tsx` は削除済み**

- **画面を足したら `src/pcOnlyScreens.ts` のどちらかの表に入れること**（M2）。
  `DAILY_PC_ONLY` か `DAILY_MOBILE_OK` で、**どちらにも入っていないと
  `npm run lint` が止まります**。決め方は `client/src/pcOnlyScreens.ts` の冒頭。
  - **このアプリは現場で開くものが多い**ので、**PC 専用は 0 枚になった**（247）。
    最後に残っていた「入ってきた情報」も外した（表を折り返すのではなく
    スマホ専用の2行カードに組み直した）。内覧会の当日受付・セキュリティカードの貸出・
    やること は**スマホが主戦場**
  - **下タブは ホーム / やること / 探す**（M9・`nav.ts` の `DAILY_MOBILE_TABS`）。
    3つ目は長らく「メニュー」でしたが、**上辺バーの ☰ と二重の入口**でした

- **1ファイル400行を上限にする。** いま `pages/TasksPage.tsx` が 1,005行
- `src/index.css` にタイマー・視聴者数のクラスが残っている（計時LIVE から流用された跡）。
  `switcher-in` の keyframes は `shared` のトークンと**重複定義**
- **`html`/`body`/`#root` はこのアプリで触らない。** 高さ・書体・印刷は
  `shared/src/client/base.css`（F2 で集約済み）。本文が 16px だったのもこれで揃った
- **「探す」は受付の道具**（M9・`pages/SearchPage.tsx` ＋ `pages/search/matchers.ts`）。
  案件管理の探す（案件・お客様・仕入先）とは中身が違い、**その場で人と
  向き合っているときに引くもの**を集めてある: 来場予約（「田中さん」「GMO」で名簿を引く）／
  セキュリティカード（「あの制作会社に何番を渡したか」）／入ってきた情報
  （「その話、前に来ていませんでしたか」）。
  - **正規化は内覧会と同じ1本**（`inview/logic.ts` の `normalizeForSearch`）。
    写すと「内覧会では当たるのに探すでは当たらない」が起きる
  - **入ってきた情報だけスマホで押せる行にしない。** あの画面は PC 専用に
    宣言してあるので、押すと案内に着いて**行き止まり**になる。要約まで出せば
    「来ていたかどうか」の答えにはなっている
  - **打つ前に左メニューと同じ並びを出さない。** また二重の入口になる。
    出すのは**いま入っているデータから出したもの**（今日の回・貸出中のカード・
    まだ仕分けていない情報）だけで、0 のものは出さない
  - セキュリティカードは `?card=<id>` で1枚を選んだ状態で開く
    （24枚の中から目でもう一度探させない）
- **内覧会の当日の受付もスマホで畳む**（M9）。当日いちばん開く画面なのに、
  390px では**最初の「受付する」に着くまで 491px**（実測）でした。検索欄だけ残して
  説明・並び替え・会社別のまとめをシートに移し **319px**。CSV はスマホに出さない。
  **PC は1文字も変えていない**（説明の全文・CSV・会社別のまとめが出ることを実測済み）
- **内覧会の検索カードはスマホで畳む**（M8）。390px ではカード枠 ＋ 4行の説明で
  **約 250px** を使い、名簿に着く前に1画面の6割が説明だった。探し方の但し書き
  （かな・全角半角・ハイフンを区別しない）は**打ち込んでから効くもの**なので1行に縮め、
  時期と並び順は `shared/src/client-v4/mobileFilterBar.tsx` のシートに入れた。
  **CSV 出力もスマホでは出さない** — 書き出したファイルを開く相手が端末に無く、
  受付で使うのは検索（ご判断の「データを出し入れする道具はスマホに出さない」）。
  **PC 側は1文字も変えていない**（実ブラウザで説明の全文と CSV が出ることを確認済み）
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
