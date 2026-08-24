# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.4.2 — **制作技術支援のハブ画面（案件・番組のトップ）で、「スケジュール表」タイルの件数バッジがスケジュール表を作っても常に「0件」のまま変わらなかった不具合を直した**（ユーザー指摘）。`MiniAppTiles.tsx` の `scheduleCount` はジャーニー（`getJourneyForProject`/`getJourneyForProgram`）が返す `days[].docs` を `app === "schedule"` で数える設計だったが、サーバー側（`journey.service.ts`）は `docs` に**進行台本（`app: "sheet"`）しか積んでおらず、スケジュール表そのものを1件も入れていなかった**ため、スケジュール表を何本作っても常に0件のままだった（スケジュール表の項目＝枠は `frames[]` に別枠で入るが、`frames` は `qsheet_schedule_items` からしか埋まらないため、作った直後の項目が0件のスケジュール表はそちらでも数えられない）。`qsheet_schedules` を「資料」として同じ `docs` の形（`app: "schedule"`）で返すよう `fetchSchedulesForProject`/`fetchSchedulesForProgram` を追加し、案件・番組どちらのジャーニーにも組み込んだ（アクセス範囲は既存の枠取得と同じ：作成者本人／共有先／system_admin）。あわせて `JourneyDayCard.tsx` の「進行台本」見出しの一覧が `day.docs` をそのまま台本として描画しており、このままだとスケジュール表まで台本の一覧に混ざって出てしまうため、`app === "sheet"` で絞り込むよう直した（`MiniAppTiles.tsx` 側は元から `app` で絞り込んでいたため変更不要）。**同じ原因の関連不具合も1件見つけて直した** — 「次に決めること」の提案 `no_schedule`（「スケジュール表がまだありません」）が、枠（項目）の有無だけで判定しており、表そのものは既にあるが項目がまだ0件（作った直後）のときも「まだありません」と事実に反した案内を出していたため、表の有無も見るよう条件を直した。検証: `npm run typecheck`（client-techops 含む）・`npm run test`（1454件）・`npm run lint` を確認済み。実DBでの実機確認はこのセッションから行っていない。 **制作技術支援・スケジュール表（PC グリッド）の時間刻みを5分固定→選択式にし、既定を15分にした**（ユーザー指摘「5分刻みは見づらい」）。これまで `qsheet_schedules.slot_min` は DB の既定値が5分のまま画面から変える手段が無く、サーバー側（`update_schedule` の REST／MCP ツール）は既に対応していたのに使う入口が無かった。① migration で既定値を 5→15 分に上げ、CHECK 制約に 60 分も追加した（従来 5/10/15/30 のみ）。② スケジュール表詳細画面（PC のグリッド表示のときだけ・スマホのカード積み表示には出ない）に「表示間隔」セレクタを新設し、5/10/15/30/60分をいつでも選び直せるようにした。`slot_min` はグリッド描画の刻みでしかなく項目の開始・終了時刻（`start_min`/`end_min`）には影響しないため、既存のスケジュール表データはそのまま・見た目だけが変わる。 **制作技術支援（techops）のスケジュール表で、項目をクリックしたときに新規作成のような空欄フォームが開いてしまう不具合を直した。**「項目を編集」ダイアログ（`ScheduleItemDialog`）は`SchedulePage` に常駐（表示は `open` の真偽だけで切り替わる）しており、フォームの中身（`draft`）は初回マウント時に一度だけ `useState` の初期化関数で作っていた。そのため、最初に開いたとき以降は `item`（クリックした項目）が変わっても中身が作り直されず、2件目以降は見出しこそ「項目を編集」・削除ボタンも出るのに、区分「その他」・09:00〜10:00 といった新規作成の既定値のまま何も埋まっていないフォームが出ていた（保存すると、その既定値でクリックした項目を上書きしてしまう状態だった）。ダイアログが開くたび（`open` が false→true になるたび）に、そのときの `item`/`initial` からフォームを作り直すよう修正した。 **PR #401（スケジュール表タイル件数0件の不具合を修正）・#402（項目クリックが新規作成の空欄になる不具合を修正）のマージ後の棚卸しを記録した**（コード変更なし）。2本とも `terai-takehiro` 本人がCI green後すぐ（約14秒〜約1分41秒）に手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。PR #403 分は別セッションの PR #404 が並行して記録しているため、重複を避けてここでは対象外とした。 **制作技術支援のトップ・一覧系画面が、案件管理など他アプリと比べてページ幅が狭かったのを直した**（ユーザー指摘）。`ProductionTopPage.tsx`（アプリのトップ）・`TopPage.tsx`（進行台本の案件選択）・`JourneyPage.tsx`（案件・番組のハブ画面）・`schedule/ScheduleListPage.tsx`（スケジュール表一覧）のルート要素が揃って `mx-auto max-w-4xl`（896px）で自ら幅を絞っていたのが原因で、案件管理側（例: `ProjectListPage.tsx`）は max-width 指定を持たずシェルの幅いっぱいに広がる設計だったため、techops だけ見た目が狭くなっていた。4画面から `mx-auto max-w-4xl` を外し、他の余白（`px-4 py-6 sm:px-6 sm:py-8` 等）はそのまま残した。本番中に使う4画面（`OnAirPage.tsx`・`RundownPage.tsx`・`PrompterPage.tsx`・`AudioSupportPage.tsx`）は対象外（`client-techops/CLAUDE.md` の禁止事項）。同じ `max-w-4xl` パターンを持つ計時・視聴者の運用画面（`LiveDashboardPage.tsx`・`LiveTimerAdminPage.tsx`）も今回は対象外とした（ユーザーへの確認時にトップ・一覧系4画面のみと明示したため）。 **PR #407（制作技術支援のページ幅修正）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約3分17秒（CI green から約1分17秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した。なお本PRは並行していた別セッションのリリースPR（#406）が7秒早くマージされたため通常の `release:notes` 収集には乗らず、ユーザーの明示的な指示（「v4.4.2のリリースにマージ」）によりこのv4.4.2のエントリへ直接追記して揃えた。

旧 v4.4.1 — **制作技術支援（techops）のスケジュール表 MCP に、枠（項目）だけでなく表そのもの・列の書き込みツールを追加した。**これまで `create_schedule_item`/`update_schedule_item`/`delete_schedule_item`（2026-08 新設）で枠は作れたが、スケジュール表そのもの（`qsheet_schedules`）と列（`qsheet_schedule_columns`、会場/支度/運営の3グループ）は画面で先に用意しておく必要があった。`create_schedule`/`update_schedule`（表そのもの）と `create_schedule_column`/`update_schedule_column`/`delete_schedule_column`/`reorder_schedule_columns`（列の追加・更新・削除・並べ替え）を追加し、表・列・枠の3段が揃ったので、新しい日のスケジュール表を1本まるごと（列も含めて自由に）MCP だけで組み立てられる。既存の HTTP ルート（`schedules.routes.ts`/`schedule-columns.routes.ts`）と同じ粒度の単純な CRUDのため台本と違い「提案まで」ではなく直接書き込む。表そのものの削除（`delete_schedule`）は共有先がいる資料への影響が大きいため対象外（引き続き画面から行う）。`gate.ts` の権限ゲートは既存の枠 CRUD と揃え、`qsheet` の editor 以上を要求する。`docs/mcp-server.md` を実装に合わせて更新済み（111 種 / 21 カテゴリ、production 22 種）。

旧 v4.4.0 — **PR #389（本番環境向けレンタル機材スクレイパーを追加）のマージ後の棚卸しを記録した**（コード変更なし）。`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」の決めごとどおり、作成から約7分39秒（CI green から約5分39秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も 401 で使えず、GitHub MCP で直接確認した）。 **MCP サーバーのツール一覧（docs/mcp-server.md）を実装と合わせ直した。** qsheet→techopsPhase 4（2026-08-22）で `production` カテゴリに旧名（`*_qsheet` 系）5種が `[非推奨/deprecated]`として二重登録されたぶんが文書に反映されておらず、「90 種」「production 8 種」のまま取り残されていた（実際は `node scripts/generate-mcp-tools.mjs` の実測で 95 種・production 13 種）。併せて v4 で新設した機材管理（`client-equipment/`）・計時・視聴者（`client-live/`）向けの MCPツールが無いことを確認し（廃止決定ではなく未着手である旨）、文書に明記した。**機材管理の MCP ツールを新設した（read 5・write 2）。** `list_equipment`/`get_equipment`（台帳検索・詳細）/`list_equipment_lendings`（貸出履歴）/`list_inventory_checks`/`get_inventory_check`（棚卸し状況）に加え、`lend_equipment`/`return_equipment`（貸出・返却）を追加した。UI と同じ`itemService`/`lendingService`/`inventoryService` を再利用している。台帳そのもの（機材の新規登録・編集・削除）は対象外の MVP スコープ（現場で頻度の高い「どこ？」「貸して」「返ってきた」のみ）。貸出・返却の権限は HTTP 側の許可（router 既定の reader）より意図的に絞り、`equipment` の editor以上を要求する。**制作技術支援（techops）のスケジュール表に書き込みツールを追加した（従来は read のみ）。**`create_schedule_item`/`update_schedule_item`/`delete_schedule_item` で、既存の`schedule-items.routes.ts` と同じ粒度で枠を作成・更新・削除できる（台本と違い「提案まで」ではなく直接書き込む — 単純な CRUD のため）。他の人の編集と競合すると `CONFLICT` を返す。いずれも `docs/mcp-server.md` を実装に合わせて更新済み（105 種 / 21 カテゴリ）。 **カレンダーのスマホ表示に週表を足し、検収書の備考・分類の不具合を直した。**① カレンダーはスマホ幅（`lg`未満）になると月表＋その日のアジェンダに固定されており、「幅が狭いと日しか見られない」というご指摘があった。実際には月表は出ていたが、週だけを見る手段がどこにも無かったため、`MobileCalHeader`（月/週の切替）と`MobileWeekStrip`（週の7日を横1列で見せる、月表と同じ「数字＋点」の見た目）を新設した。② 備考に何も書いていない見積から検収書・請求書を作ると「見積 v2 から登録」という社内向けの自動文言が印字される不具合を直した。見積を売上に変換するとき(`estimate.service.ts` の `convertToRevenue`) に自動生成していた定型文を、見積側の備考をそのまま写す形に直した（どの見積から変換したかは`estimates.revenue_id` から辿れるため、備考に埋め込む必要が無い）。③ 見積書はカテゴリが「スタジオ」「技術・人員」「制作・その他」と日本語なのに、検収書・請求書では画面の内部キー（`studio`/`tech`/`other`）がそのまま英語で印字される不具合を直した。見積を売上に変換すると `estimate_items.category` のキーがそのまま `revenue_items.category` へ写るが、日本語へ翻訳する処理（`estimate-pdf.service.ts` の `categoryLabel`）が見積書 PDF の生成経路にしか無かったため。同じ翻訳を `/revenues/:id/pdf`（請求書・検収書）でも使うようにした（自由入力の分類はこれまでどおりそのまま出す）。 **PR #393（カレンダーのスマホ週表示と検収書の備考・分類を修正）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約2分57秒（CI green から約45秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **PR #395（機材管理のMCPツール新設・techopsスケジュール表への書き込み追加）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約14分38秒（CI green から約13分）でterai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを`docs/reviews/codex-findings-v4.md` に記録した。新設した書き込み系ツール（貸出/返却の二重貸出ガード・スケジュール表writeのエラー変換・gate.tsの権限ゲート）を実際のOAuthフロー・実DBでこの開発セッションから確認していない旨も併記した。 **トップページ「お待たせ中」の各行が、種類によっては押しても何も起きなかった（あるいは見当違いの画面に送られていた）不具合を直した**（ユーザー指摘）。以前は行き先を決める`inboxHrefOf` が種類（期限超過／ネタ案件／問い合わせ／見積・請求）を見ずに、`sales` の `editor` 権限（`can.intake`）さえあれば無条件で案件作成（`/sales/projects/new`）へ送っていた。ところが案件作成の画面が並べるのはネタ案件・問い合わせの2種類だけなので、①期限超過の次回アクションや見積・請求の書類を押しても該当の行はどこにも出てこず、②`editor` を持たない（閲覧だけの）`sales` 利用者には条件そのものが偽になり、期限超過の行が一律クリックできない（押しても本当に何も起きない）ままだった。種類ごとに本来の行き先へ振り分けるよう直した：期限超過はそれを記録した案件のやり取り（`/sales/projects/:id/thread`。閲覧できるかは新設した `viewProjects`＝`editor` 未満でも真になる権限で判定）、見積・請求は財務の「受け取った書類」、ネタ案件・問い合わせはこれまでどおり案件作成（`sales` の `editor` が無い場合は問い合わせのみ「入ってきた情報」へ）。

旧 v4.3.1 — **v4.3 の実機点検で見つかった不具合をまとめて修正した**。① トップページの「お客様を待たせているもの」「案件管理」バッジが実数より小さく出ることがあった（`items.length`＝一覧表示用の上限付き件数を数字に使っていた。`counts.total`＝サーバーが数えた実数に直した）。② カレンダー「一覧」表示で、月表のマス目埋め用に取得した前月分のデータがヘッダーの年月と食い違ったまま先頭行に混ざって見えていたのを、表示中の月で絞り込むよう修正した。③ カレンダー「仮押さえ」に、本番が何ヶ月も前に終わった案件が無期限に残り続けていた（一覧取得に `from` を渡していなかったため下限が無かった）のを修正した。④ 営業活動記録「失注分析」の月別失注推移で、金額が実際の失注月ではなく直近に別項目を編集した月（`updated_at`）に丸ごと計上されていたのを、失注確定日（`lost_at`）で集計するよう修正した。⑤ 財務管理の請求一覧等で、案件名の一部が半角カナ化けして表示される不具合を、表示側の正規化（NFKC）と、案件の新規作成・編集・AI起票の保存時の正規化の両方で修正した。⑥ 制作技術支援「計時・視聴者」タブだけ左サイドバーのサブメニューが「トップ」のみに落ちていた（owner文脈の解決経路にこのタブのURLパターンが無く、かつ文脈をストアへ書き込んでもいなかった）のを修正した。⑦ 進行台本一覧の「最終更新」が閲覧時点の現在時刻になっていた（ドキュメント自体の更新日時を見ていなかった）のを修正した。⑧ 日常業務「タスク・依頼」の見出し「まずこの3件」が実件数と連動していなかった、「チーム」画面の列見出しに「スコア 9」と数字が紛れ込んでいた、ウィークリー活動報告で「下書き」「確認済み」という相反する語感のバッジが並んで見えた、の3件を修正した。⑨ 財務管理サイドバーに残っていた開発時の内部向け表現「そのほか（作り直し前）」を利用者向けの文言に直した。⑩ 制作技術支援の収録設定・配信設定・レンタル機材検索で、実施日／利用期間の既定値が案件の実施日ではなく常に今日になっていた（設定がまだ1件も無い新規案件は今日にフォールバックしていた）のを、案件/番組の本番実施日を既定にするよう修正した。⑪ 財務管理の取込PDF一覧で、楽楽精算のように1伝票が複数の登録単位に分かれる場合に一部の単位だけ登録して離脱すると、抽出金額（PDFヘッダーの合計）と実際に台帳へ入った額の差が分かりにくかったのを、「N単位中M単位だけ登録済み」という警告を一覧に出すよう修正した（解析・登録のロジック自体は変えていない）。 **制作技術支援・計時・視聴者のブラウザタブのタイトルが旧アプリ名のままだったのを直した**。制作技術支援（`client-techops/`）は2026-08-22に「Qシート」→「制作資料」→「制作技術支援」と改名済みだったが、`index.html` の `<title>` だけ「GMO ONAiR Qシート」のまま取り残されていた（ユーザー指摘）。同種の残骸を横断調査し、同じく2026-08-22に「計時LIVE」→「計時・視聴者」に改名済みの計時・視聴者（`client-live/`）にも同じ取り残しを見つけて直した。表示画面（`/live/display/:timerId`）の見た目は変えていない。あわせて PR #387（v4.3 実機点検の不具合修正）のマージ後棚卸しを記録した（コード変更なし）。 **制作技術支援まわりに残っていた旧アプリ名の表示崩れ・不具合をまとめて直した**（ユーザー指摘の横断調査）。①アプリ切替ボタンに `appKey="qsheet"` という未登録キーを渡していたため、制作技術支援の全画面でヘッダーのアプリ切替が「ONAiR」表示に落ち、アイコンも出ず、切替候補にも自分自身が重複して出ていた不具合を `appKey="techops"` に直した（最も影響が大きいもの）。②同アプリの利用マニュアルのタイトル・ログイン画面の案内文が「Qシート」のままだったのを「制作技術支援」に直した。③設定「ユーザー管理・権限」の手順説明が、権限モデル単純化で廃止済みの旧UI（🔑ボタンで8モジュールを個別設定・「権限修復」ボタン）を説明したままだったのを、現行の役割（型）ベースの5区画UIに合わせて書き直した。 **本番環境でレンタル機材のスクレイピングが動いていなかったのを直した**（本番向けスクレイパーを新設）。①本番（`gmo-onair.jp`）でレンタル機材検索のクロールが「全然効かない」という報告があったが、原因は不具合ではなく**本番向けのスクレイパー自体がそもそも存在しなかった**こと（検証環境専用の`rental_scraper_dev` しか無く、`qsheet_rental_items` を本番の Postgres へ同期する経路が最初から無かった）。②ユーザーの明示的な指示のもと本番向けサービス `rental_scraper_prod` を新設。`docker-compose.yml` に検証と同構成（同期先だけ `onair_prod`）で追加し、`.github/workflows/deploy.yml` の production ジョブに、Release 公開時のデプロイに続けてビルド・起動・生存確認（`docker inspect` で state/再起動回数を見て `::warning::` を出す）を追加した（検証環境で実際に踏んだ「起動はしたがクラッシュを繰り返し4時間気づけなかった」事故の再発防止策をそのまま踏襲）。③対象2社サイトは検証・本番の区別をしない同一の実サイトのため、同時刻にクロールしてアクセス頻度が実質2倍にならないよう、実行時刻を検証（`RENTAL_CRON_HOUR` 既定5時）と別の環境変数・既定値（`RENTAL_CRON_HOUR_PROD` 既定4時）にずらした。ステージング用 SQLite も検証と別の永続ボリューム（`rental_scraper_prod_data`）に分離し、本番・検証のクロール途中経過が混ざらないようにした。ダミーサンプル（`seed-rental.ts`）は本番では従来どおり起動時シード自体が走らないため混入しない。 **PR #388（ブラウザタブ・アプリ切替に残っていた旧アプリ名の不具合を修正）のマージ後の棚卸しを記録した**（コード変更なし）。レビュー0件のままマージされたため、その旨と未検証事項（`AppShell.tsx` の `appKey` 修正・権限マニュアルの書き直しを実ブラウザで確認していないこと）を `docs/reviews/codex-findings-v4.md` に記録した。

> それより前の版の履歴（全件）は [docs/version-history.md](docs/version-history.md) にあります
> （画面ヘッダーの時計アイコンからも全件見られます。この節に残すのは旧3件だけ —
> リリース時に `npm run release:notes` が自動で古い分を落とします）。

---

## ブロックアプリ構成

アプリごとの決めごとは各ディレクトリの `CLAUDE.md` に、最新の一覧表はルート
[`CLAUDE.md`](CLAUDE.md)「ブロックアプリ一覧」にあります。要点だけ:

| アプリ | ディレクトリ | 公開パス | 状態 |
|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定 | [`client/`](client/CLAUDE.md) | `/` | 稼働 |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 稼働 |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 稼働 |
| 制作技術支援（Qシート） | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧 `/qsheet/` も後方互換） | 稼働（表本体の v4 化が残） |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 稼働（制作技術支援のミニアプリ） |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | — | **廃止**（コードは保存・配信停止） |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | 全アプリの土台 |

外部リンク（別 VPS・別タブ）: [インタラクティブ](https://interactive.gmo-onair.jp/)・[翻訳](https://gmo-translate.jp/)

全アプリは同一ドメインで配信され、Nginx のパスルーティング + Express の静的配信で分岐します。
認証と API は共通（`/api/v1/internal/*`）です。

---

## 技術スタック

- **フロントエンド**: React 18 + Vite 6 + TypeScript + TailwindCSS 3 + shadcn/ui +
  TanStack Query + Zustand + React Router v6
- **バックエンド**: Node.js + Express + TypeScript + PostgreSQL 16（`pg`）
- **リアルタイム**: Socket.IO（`/techops` — 旧 `/qsheet` とは常時相互中継のブリッジ構成 — ほか各名前空間）
- **認証**: `AUTH_MODE`（環境変数 > `NODE_ENV` 既定）で切替 — 本番は Email/Password + SMS 2FA、
  検証・開発は mockAuth（ユーザーカード選択式）。Google 連携はカレンダー用
- **インフラ**: Docker Compose + Nginx + Let's Encrypt / CoNoHa VPS（本番・検証を単一 VPS で並走）
- **モノレポ**: npm workspaces / ローカル開発は Dev Containers

---

## 開発の始め方

環境構築から PR までの詳しい手順は [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
npm install
npm run verify:up      # 検証用 Postgres（ポート5433・本番と完全分離）
npm run dev            # 主要アプリ + server（全アプリは dev:all）
```

```bash
npm run typecheck      # 型チェック（CI は typecheck:all）
npm run lint           # eslint + 文書リンク・changelog 等の検査
npm run test           # shared の Vitest（CI が回す・手元の gate にも入れる）
npm run build:changed  # 変更したワークスペースだけビルド
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
```

---

## デプロイ

手順は [docs/branching.md](docs/branching.md)、仕組みは [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。要点:

| やりたいこと | 操作 |
| --- | --- |
| 検証環境 (dev.gmo-onair.jp) に出す | **`main` に PR をマージする**（自動デプロイ） |
| 特定ブランチだけ検証環境で見る | Actions → **Preview** → ref を入力（本番には出せない） |
| **本番 (gmo-onair.jp) に出す** | GitHub で **Release（タグ `vX.Y.Z`）を公開する** |
| 本番を戻す | Releases から**1つ前のタグの Deploy を再実行** |

ビルドは GitHub Actions 上で行い、イメージを GHCR (`ghcr.io/terai-takehiro/gmo-onair`) に
push、VPS は pull してコンテナを差し替えるだけです（VPS 上ではビルドしません）。

---

## ブランチ運用

**正は [docs/branching.md](docs/branching.md)。** GitHub Flow ＋ リリースタグです。

- **長く残るブランチは `main` だけ。** 直接 push 禁止（PR のみ・**Squash マージ固定**）
- **`main` は本番ではありません。** `main` = 検証環境／本番はタグが指すコード
- 作業ブランチは `feature/<Issue番号>-<短い名前>`（`fix/` `chore/` `docs/`）。数日で PR にして消す
- PR タイトルは `種類(アプリ): 何をしたか`（例 `feat(equipment): 機材台帳を v4 の見た目にした`）

### バージョン管理

**リリースするときだけ**上げます。作業 PR は版番号を触らず、`docs/changelog.d/` に
載せたい文を1つ置きます（`npm run lint` が強制）。リリース時は
`npm run release:notes -- X.Y.Z` が次の3か所を更新し、`npm run check:version` が整合を検査します:

1. ルート `package.json` の `version` ← **唯一の情報源**
2. `CLAUDE.md`「## 現在のバージョン」の先頭に1行追記（4件目はアーカイブへ）
3. `README.md` の「現在のバージョン」（この文書の冒頭・旧3件までに自動整理）

**各ワークスペースの `package.json` は更新しません**（どこからも読まれず、更新すると
Docker のビルドキャッシュが無効化されます）。

---

## ドキュメント

- **docs/ の目次**: [docs/README.md](docs/README.md) — 現役の正・生成物・作業場・archive の4分類
- **プロジェクトメモリ**: [CLAUDE.md](CLAUDE.md) — 開発方針・環境分離・セキュリティの決めごと
- **環境構築から PR まで**: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## セキュリティ

- `.env` や認証情報は**絶対に Git にコミットしない**
- API キー・JWT シークレットをソースにハードコードしない
- 本番 DB と検証 DB は**完全分離**（相互参照・相互コピー禁止）
- 本番 DB への直接 SQL 操作は**最小限**（緊急時のみ）

詳細は [CLAUDE.md](CLAUDE.md) の「セキュリティポリシー」「環境分離ポリシー」。

---

## ライセンス

本プロジェクトは GMOグローバルスタジオ社内で利用するクローズドソースです。
