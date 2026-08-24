# GMO ONAiR - プロジェクトメモリ

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの制作管理プラットフォーム（会社OS）の総称。
複数の「ブロックアプリ」を束ねるプラットフォームであり、特定の機能を指す名称ではない。
GLS番号を中核として全アプリのデータが紐づく。

### ブロックアプリ一覧

**アプリ固有のことは各ディレクトリの `CLAUDE.md` に書いてある。** ここには全体に効くことだけ置く
(この文書は毎ターン文脈に読み込まれるため、小さく保つ)。

| アプリ | ディレクトリ | ベースパス | ポート | v4.0.0 | 概要 |
|---|---|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定 | [`client/`](client/CLAUDE.md) | `/` | 5173 | **対象** | 案件・見積・売上・仕入・損益・予定・権限。v4 でプロジェクト管理を追加 |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 5180 | **対象** | 週報・ニュース・内覧会・受領書類・セキュリティカード |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 5175 | **対象** | 機材台帳・ラック図・貸出・棚卸し |
| 制作技術支援 (中の Qシート) | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧`/qsheet/`も後方互換で生存） | 5174 | 凍結解除中 | 台本作成・本番進行 (進行/ランダウン/プロンプター/音声サポート)＋計時・視聴者のミニアプリ。旧「制作資料」を 2026-08-22 に改名・大アプリへ格上げ。qsheet→techops 改名は Phase 1〜4 済み（旧URL・旧MCPツール名はブリッジ/二重登録で互換維持。`permissionModule`・DBは `qsheet` のまま、詳細は[docs/reviews/qsheet-techops-migration-plan.md](docs/reviews/qsheet-techops-migration-plan.md)） |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 5178 | **対象** | タイマー・視聴者カウンター。運用画面は共通シェル・v4トークン化済み。**表示画面 (`/live/display/`) だけ例外**（見た目を変えない） |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | ~~`/awards/`~~ | ~~5179~~ | **廃止** | 放送CG演出・送出 (内部識別子は `awards` のまま)。**コードは保存・配信は停止**（2026-08〜） |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | — | **対象** | トークン・UI部品・共通シェル。**触ると全アプリに効く** |

**「凍結」「凍結解除中」「廃止」の定義と経緯は [docs/v4-plan.md](docs/v4-plan.md) の「用語」の節。**
制作技術支援の残作業（表本体・`EditorSidebar`・本番系画面の作り直し）は
[`client-techops/CLAUDE.md`](client-techops/CLAUDE.md)。

### 外部リンク (別 VPS / 別タブで開く)
| アプリ | URL | 概要 |
|---|---|---|
| インタラクティブ | https://interactive.gmo-onair.jp/ | EventStamp・リアルタイム演出 (別 VPS) |
| 翻訳 | https://gmo-translate.jp/ | GMO 翻訳ツール |

## Claude の応答言語ポリシー
- **作業中（ツール呼び出しの説明・思考過程など）は英語で処理してよい。**
- **チャットでユーザーに返す最後の返信は、必ず簡潔な日本語**にする
  (処理内容の垂れ流しではなく、結論・状態・次のアクションが分かる短い要約)。

## 技術構成
- **フロントエンド**: React 18 + Vite 6 + TailwindCSS 3 + shadcn/ui
- **バックエンド**: Express + PostgreSQL (pg)。1つのサーバーが配信中5アプリの静的ファイルを配信する**単一イメージ構成**（廃止したリアルタイムCGは配信しない）
- **モノレポ**: npm workspaces (client, client-daily, client-equipment, client-techops, client-live, client-awards, server, shared)
- **リアルタイム**: Socket.IO (`/techops` ネームスペース: OnAir↔ランダウン同期。旧 `/qsheet` も
  ブリッジで生存中・詳細は[client-techops/CLAUDE.md](client-techops/CLAUDE.md), awards/quiz/liveops 各ネームスペース)
- **デプロイ先**: CoNoHa VPS (Docker Compose + PostgreSQL + Nginx)

### よく使うコマンド
```bash
npm run verify:up      # 検証用 Postgres を立てる (約4秒・ポート5433・本番とは完全分離)
npm run dev            # 既定3アプリ + server  (全アプリは dev:all)
npm run typecheck      # 既定3アプリ + server  (CI は typecheck:all = 廃止アプリを除く全ワークスペース)
npm run build:changed  # 変更したワークスペースだけビルド (全部だと2分)
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
npm run fonts          # LINE Seed JP を同梱し直す (v4 対象アプリは Google Fonts を読まない)
npm run lint           # eslint ほか各種検査  /  npm run check:version  # バージョン表記の整合
npm run test           # shared の Vitest (**CI が回す。手元の gate にも必ず入れる**)
```
`build` / `typecheck` / `dev` の既定が3アプリなのは**手元の速さのため**。
本番は Dockerfile が**廃止アプリを除く全アプリ**をビルドする。

### どこに何が書いてあるか
| 知りたいこと | 読む場所 |
| --- | --- |
| v4 の開発計画・スコープ・段取り | [docs/v4-plan.md](docs/v4-plan.md) |
| **v4 でどこまで出来たか (サイトツリー)** | [docs/v4-progress.md](docs/v4-progress.md) — `node scripts/v4-progress.mjs --write` で**画面のファイルを読んで作る生成物**。手で書くとずれるので、v4 の PR では毎回作り直して本文に貼る |
| **全画面を macOS/iOS ネイティブ級にする計画（2026-08〜）** | [docs/v4-native-ui-plan.md](docs/v4-native-ui-plan.md) — PC専用を原則廃止し全画面をマルチデバイス対応にする追加の取り組み。対象範囲の決定・監査結果・バックログ |
| ブランチ・PR・リリース手順 | [docs/branching.md](docs/branching.md) |
| 環境構築から PR まで | [CONTRIBUTING.md](CONTRIBUTING.md) |
| デプロイの仕組み (GHCR・キャッシュ・戻し方) | [docs/deploy-pipeline.md](docs/deploy-pipeline.md) |
| 版ごとの変更 (過去全件のアーカイブ) | [docs/version-history.md](docs/version-history.md) |
| v4 の画面ごとの仕様 (モックから切り出したもの) | `docs/design/v4/` |
| 用語の決めごと | [docs/wording.md](docs/wording.md) |
| **どの仕事にどのモデルを使うか** | [docs/ai-models.md](docs/ai-models.md) — 段は light / heavy の2つだけ。**基準は「間違いに気づけるか」で費用ではない** |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |

## 現在のバージョン
v4.4.2 — **制作技術支援のハブ画面（案件・番組のトップ）で、「スケジュール表」タイルの件数バッジがスケジュール表を作っても常に「0件」のまま変わらなかった不具合を直した**（ユーザー指摘）。`MiniAppTiles.tsx` の `scheduleCount` はジャーニー（`getJourneyForProject`/`getJourneyForProgram`）が返す `days[].docs` を `app === "schedule"` で数える設計だったが、サーバー側（`journey.service.ts`）は `docs` に**進行台本（`app: "sheet"`）しか積んでおらず、スケジュール表そのものを1件も入れていなかった**ため、スケジュール表を何本作っても常に0件のままだった（スケジュール表の項目＝枠は `frames[]` に別枠で入るが、`frames` は `qsheet_schedule_items` からしか埋まらないため、作った直後の項目が0件のスケジュール表はそちらでも数えられない）。`qsheet_schedules` を「資料」として同じ `docs` の形（`app: "schedule"`）で返すよう `fetchSchedulesForProject`/`fetchSchedulesForProgram` を追加し、案件・番組どちらのジャーニーにも組み込んだ（アクセス範囲は既存の枠取得と同じ：作成者本人／共有先／system_admin）。あわせて `JourneyDayCard.tsx` の「進行台本」見出しの一覧が `day.docs` をそのまま台本として描画しており、このままだとスケジュール表まで台本の一覧に混ざって出てしまうため、`app === "sheet"` で絞り込むよう直した（`MiniAppTiles.tsx` 側は元から `app` で絞り込んでいたため変更不要）。**同じ原因の関連不具合も1件見つけて直した** — 「次に決めること」の提案 `no_schedule`（「スケジュール表がまだありません」）が、枠（項目）の有無だけで判定しており、表そのものは既にあるが項目がまだ0件（作った直後）のときも「まだありません」と事実に反した案内を出していたため、表の有無も見るよう条件を直した。検証: `npm run typecheck`（client-techops 含む）・`npm run test`（1454件）・`npm run lint` を確認済み。実DBでの実機確認はこのセッションから行っていない。 **制作技術支援・スケジュール表（PC グリッド）の時間刻みを5分固定→選択式にし、既定を15分にした**（ユーザー指摘「5分刻みは見づらい」）。これまで `qsheet_schedules.slot_min` は DB の既定値が5分のまま画面から変える手段が無く、サーバー側（`update_schedule` の REST／MCP ツール）は既に対応していたのに使う入口が無かった。① migration で既定値を 5→15 分に上げ、CHECK 制約に 60 分も追加した（従来 5/10/15/30 のみ）。② スケジュール表詳細画面（PC のグリッド表示のときだけ・スマホのカード積み表示には出ない）に「表示間隔」セレクタを新設し、5/10/15/30/60分をいつでも選び直せるようにした。`slot_min` はグリッド描画の刻みでしかなく項目の開始・終了時刻（`start_min`/`end_min`）には影響しないため、既存のスケジュール表データはそのまま・見た目だけが変わる。 **制作技術支援（techops）のスケジュール表で、項目をクリックしたときに新規作成のような空欄フォームが開いてしまう不具合を直した。**「項目を編集」ダイアログ（`ScheduleItemDialog`）は`SchedulePage` に常駐（表示は `open` の真偽だけで切り替わる）しており、フォームの中身（`draft`）は初回マウント時に一度だけ `useState` の初期化関数で作っていた。そのため、最初に開いたとき以降は `item`（クリックした項目）が変わっても中身が作り直されず、2件目以降は見出しこそ「項目を編集」・削除ボタンも出るのに、区分「その他」・09:00〜10:00 といった新規作成の既定値のまま何も埋まっていないフォームが出ていた（保存すると、その既定値でクリックした項目を上書きしてしまう状態だった）。ダイアログが開くたび（`open` が false→true になるたび）に、そのときの `item`/`initial` からフォームを作り直すよう修正した。 **PR #401（スケジュール表タイル件数0件の不具合を修正）・#402（項目クリックが新規作成の空欄になる不具合を修正）のマージ後の棚卸しを記録した**（コード変更なし）。2本とも `terai-takehiro` 本人がCI green後すぐ（約14秒〜約1分41秒）に手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。PR #403 分は別セッションの PR #404 が並行して記録しているため、重複を避けてここでは対象外とした。

v4.4.1 — **制作技術支援（techops）のスケジュール表 MCP に、枠（項目）だけでなく表そのもの・列の書き込みツールを追加した。**これまで `create_schedule_item`/`update_schedule_item`/`delete_schedule_item`（2026-08 新設）で枠は作れたが、スケジュール表そのもの（`qsheet_schedules`）と列（`qsheet_schedule_columns`、会場/支度/運営の3グループ）は画面で先に用意しておく必要があった。`create_schedule`/`update_schedule`（表そのもの）と `create_schedule_column`/`update_schedule_column`/`delete_schedule_column`/`reorder_schedule_columns`（列の追加・更新・削除・並べ替え）を追加し、表・列・枠の3段が揃ったので、新しい日のスケジュール表を1本まるごと（列も含めて自由に）MCP だけで組み立てられる。既存の HTTP ルート（`schedules.routes.ts`/`schedule-columns.routes.ts`）と同じ粒度の単純な CRUDのため台本と違い「提案まで」ではなく直接書き込む。表そのものの削除（`delete_schedule`）は共有先がいる資料への影響が大きいため対象外（引き続き画面から行う）。`gate.ts` の権限ゲートは既存の枠 CRUD と揃え、`qsheet` の editor 以上を要求する。`docs/mcp-server.md` を実装に合わせて更新済み（111 種 / 21 カテゴリ、production 22 種）。

v4.4.0 — **PR #389（本番環境向けレンタル機材スクレイパーを追加）のマージ後の棚卸しを記録した**（コード変更なし）。`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」の決めごとどおり、作成から約7分39秒（CI green から約5分39秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も 401 で使えず、GitHub MCP で直接確認した）。 **MCP サーバーのツール一覧（docs/mcp-server.md）を実装と合わせ直した。** qsheet→techopsPhase 4（2026-08-22）で `production` カテゴリに旧名（`*_qsheet` 系）5種が `[非推奨/deprecated]`として二重登録されたぶんが文書に反映されておらず、「90 種」「production 8 種」のまま取り残されていた（実際は `node scripts/generate-mcp-tools.mjs` の実測で 95 種・production 13 種）。併せて v4 で新設した機材管理（`client-equipment/`）・計時・視聴者（`client-live/`）向けの MCPツールが無いことを確認し（廃止決定ではなく未着手である旨）、文書に明記した。**機材管理の MCP ツールを新設した（read 5・write 2）。** `list_equipment`/`get_equipment`（台帳検索・詳細）/`list_equipment_lendings`（貸出履歴）/`list_inventory_checks`/`get_inventory_check`（棚卸し状況）に加え、`lend_equipment`/`return_equipment`（貸出・返却）を追加した。UI と同じ`itemService`/`lendingService`/`inventoryService` を再利用している。台帳そのもの（機材の新規登録・編集・削除）は対象外の MVP スコープ（現場で頻度の高い「どこ？」「貸して」「返ってきた」のみ）。貸出・返却の権限は HTTP 側の許可（router 既定の reader）より意図的に絞り、`equipment` の editor以上を要求する。**制作技術支援（techops）のスケジュール表に書き込みツールを追加した（従来は read のみ）。**`create_schedule_item`/`update_schedule_item`/`delete_schedule_item` で、既存の`schedule-items.routes.ts` と同じ粒度で枠を作成・更新・削除できる（台本と違い「提案まで」ではなく直接書き込む — 単純な CRUD のため）。他の人の編集と競合すると `CONFLICT` を返す。いずれも `docs/mcp-server.md` を実装に合わせて更新済み（105 種 / 21 カテゴリ）。 **カレンダーのスマホ表示に週表を足し、検収書の備考・分類の不具合を直した。**① カレンダーはスマホ幅（`lg`未満）になると月表＋その日のアジェンダに固定されており、「幅が狭いと日しか見られない」というご指摘があった。実際には月表は出ていたが、週だけを見る手段がどこにも無かったため、`MobileCalHeader`（月/週の切替）と`MobileWeekStrip`（週の7日を横1列で見せる、月表と同じ「数字＋点」の見た目）を新設した。② 備考に何も書いていない見積から検収書・請求書を作ると「見積 v2 から登録」という社内向けの自動文言が印字される不具合を直した。見積を売上に変換するとき(`estimate.service.ts` の `convertToRevenue`) に自動生成していた定型文を、見積側の備考をそのまま写す形に直した（どの見積から変換したかは`estimates.revenue_id` から辿れるため、備考に埋め込む必要が無い）。③ 見積書はカテゴリが「スタジオ」「技術・人員」「制作・その他」と日本語なのに、検収書・請求書では画面の内部キー（`studio`/`tech`/`other`）がそのまま英語で印字される不具合を直した。見積を売上に変換すると `estimate_items.category` のキーがそのまま `revenue_items.category` へ写るが、日本語へ翻訳する処理（`estimate-pdf.service.ts` の `categoryLabel`）が見積書 PDF の生成経路にしか無かったため。同じ翻訳を `/revenues/:id/pdf`（請求書・検収書）でも使うようにした（自由入力の分類はこれまでどおりそのまま出す）。 **PR #393（カレンダーのスマホ週表示と検収書の備考・分類を修正）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約2分57秒（CI green から約45秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **PR #395（機材管理のMCPツール新設・techopsスケジュール表への書き込み追加）のマージ後の棚卸しを記録した**（コード変更なし）。作成から約14分38秒（CI green から約13分）でterai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを`docs/reviews/codex-findings-v4.md` に記録した。新設した書き込み系ツール（貸出/返却の二重貸出ガード・スケジュール表writeのエラー変換・gate.tsの権限ゲート）を実際のOAuthフロー・実DBでこの開発セッションから確認していない旨も併記した。 **トップページ「お待たせ中」の各行が、種類によっては押しても何も起きなかった（あるいは見当違いの画面に送られていた）不具合を直した**（ユーザー指摘）。以前は行き先を決める`inboxHrefOf` が種類（期限超過／ネタ案件／問い合わせ／見積・請求）を見ずに、`sales` の `editor` 権限（`can.intake`）さえあれば無条件で案件作成（`/sales/projects/new`）へ送っていた。ところが案件作成の画面が並べるのはネタ案件・問い合わせの2種類だけなので、①期限超過の次回アクションや見積・請求の書類を押しても該当の行はどこにも出てこず、②`editor` を持たない（閲覧だけの）`sales` 利用者には条件そのものが偽になり、期限超過の行が一律クリックできない（押しても本当に何も起きない）ままだった。種類ごとに本来の行き先へ振り分けるよう直した：期限超過はそれを記録した案件のやり取り（`/sales/projects/:id/thread`。閲覧できるかは新設した `viewProjects`＝`editor` 未満でも真になる権限で判定）、見積・請求は財務の「受け取った書類」、ネタ案件・問い合わせはこれまでどおり案件作成（`sales` の `editor` が無い場合は問い合わせのみ「入ってきた情報」へ）。


> **これより前の版は [docs/version-history.md](docs/version-history.md) にあります**（v4.0.2 以下・427件）。
> 画面の「バージョン履歴」は **CLAUDE.md ＋ アーカイブの両方**から作られるので、表示は全件のままです。
>
> **ここに残すのは最新3件だけ。** リリースのたびに4件目をアーカイブの「## 過去のバージョン」直下へ移してください。
> この節は毎セッションの文脈に必ず載るため、履歴を貯めると全作業のコストが上がります
> （v3.2.2 時点で **680KB＝この文書の96%** が履歴で、切り出して 707KB → 35KB になりました）。

## 開発の絶対原則: AIを使い捨てにしない (必須チェック)

会社方針。**AI 機能を作る・変えるときは必ず**フィードバックループを設計に組み込む。
AI を一度使って終わりにすると人間の修正コストが永久に減らず、直した労力が資産にならない。

**回すループ**: ①AIが業務を実行 → ②4つのフィードバックを回収 (業務結果 / 人間の修正差分 / 顧客反応 / 成果指標) → ③AI改善に反映 (プロンプト・ナレッジ・学習データ) → ①に戻す

**設計時に必ず満たす5条件**: 1) AI出力を記録・保存 2) 人間の修正を差分として残す 3) 顧客反応と成果指標を出力に紐づける 4) 貯めたデータをAI改善に戻す経路 5) レビュー頻度と担当を決める

**運用**: AI/MCP/スキル/自動化の設計・変更時は `.claude/skills/ai-feedback-loop/` のスキルを使い、
5条件の充足表を出して**抜けを明示**する。経路が作れない要素は「できない」で止めず必ず代替案を添える。
ONAiR の現状 (何が既にあり、どこが穴か) は同スキルの `references/onair-current-state.md` に集約済み。
AI が関与しない UI 修正・CRUD・デプロイ作業には適用しない。

## ブランチ運用とリリース

**正は [docs/branching.md](docs/branching.md)。** ここには要点だけ置く (二重に書くと必ず片方が古くなる)。

- **長く残るブランチは `main` だけ。** 直接 push 禁止 (PR のみ・Squash マージ固定)
- **`main` は本番ではない。** `main` にマージ = **検証環境** (dev.gmo-onair.jp) に自動デプロイ
- **本番に出るのは GitHub で Release (タグ `vX.Y.Z`) を公開したときだけ。** ユーザーの明示的な指示なしに公開しない
- 作業ブランチは `feature/<Issue番号>-<短い名前>` (`fix/` `chore/` `docs/`)。数日で PR にして消す
- **ブランチ単位で検証環境に出したいとき**は Actions → Preview → ref を入力 (本番には出せない)
- **PR タイトルは `種類(アプリ): 何をしたか`** 例 `feat(equipment): 機材台帳を v4 の見た目にした`
  → Squash マージで `main` の1コミットになるため、`git log --oneline` がそのまま機能の一覧になる
- ⚠️ **Claude が PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` を使って見張る（マスト）。**
  「見張りますか」と訊いて返事を待つのも不可 — その間 CI 失敗もレビューも誰も見ない
- ⚠️ **マージしたら、その PR のレビュー指摘を棚卸しに移す**（`npm run reviews:debt` →
  [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) の表）。
  **マージすると指摘は画面から消えるので、書かなければ存在ごと消えます** —
  実測で **143 件が埋もれ、それを潰す作業にも 26 件付き、24 件が記録されていません**でした
  （うち1件は**リリースが出せなくなる P1**）。**直さないと決めたものも表から消さない。**
  手順は [docs/branching.md](docs/branching.md#マージしたらその-pr-のレビューを棚卸しに移す必須)

### バージョンと履歴

**手順の正は [docs/branching.md](docs/branching.md)。** ここは要点のみ:

- **作業 PR では版を触らない。** 代わりに `docs/changelog.d/<枝の名前>.md` に載せたい文を
  1つ置く（`npm run lint` の `check-changelog.mjs` が**両方**を強制する）
- **リリース時**に `npm run release:notes -- X.Y.Z` が3か所（ルート `package.json` /
  この文書の「現在のバージョン」/ `README.md`）とアーカイブ移動を全部やる。
  整合は `npm run check:version`。各ワークスペースの `package.json` は触らない
  （Docker のビルドスキップが無効化される）
- 画面の「バージョン履歴」は `scripts/generate-version-history.mjs` が
  **この文書（最新3件）＋ [docs/version-history.md](docs/version-history.md)（それ以前の全件）**
  から生成する。**書式を崩すとパースに失敗する**（この文書は `vX.Y.Z — **タイトル**。本文` の
  1行・アーカイブ側は全体を `(...)` で包んだ1行）
- **「現在のバージョン」は最新3件だけ・1エントリ＝タイトル＋2〜3文まで。** 長い経緯は
  該当のレビュー文書に書いてリンクする。詳細を残したい版は**全文をアーカイブ側に置けば
  画面は長いほうを表示する**（この節は毎ターン文脈に載るため、貯めると全作業のコストが上がる）

## 環境分離ポリシー (最重要)

### 本番環境と検証環境は絶対に干渉させない
- **本番**: `https://gmo-onair.jp`
  - コンテナ: `app-prod`
  - DB: `onair_prod`
  - 認証: Email/Password + SMS 2FA
  - `SKIP_SEED=true` (シードデータ投入しない)
  - マスター管理者のみ自動作成
- **検証**: `https://dev.gmo-onair.jp`
  - コンテナ: `app-dev`
  - DB: `onair_dev`
  - 認証: mockAuth (ユーザーカード選択式)
  - シードデータ投入あり (全テーブル網羅のダミーデータ)
  - 自由に壊せる環境

### 絶対厳守
- 本番DBと検証DBは**完全分離**。相互参照・相互コピー禁止
- 本番DBに対する直接SQL操作は**最小限**（管理者パスワードリセット等の緊急時のみ）
- 検証環境のデータが本番に流れ込まないこと
- 本番環境の秘密情報（JWT_SECRET等）を検証環境で使わないこと
- **本番へ出す（GitHub Release の公開）は、ユーザーの明示的な指示があるときだけ。**
  いかなる理由があっても Claude が自分の判断で公開しない。`main` への直接 push も禁止（PR のみ）

デプロイの流れ: PR を `main` にマージ → 検証環境に自動デプロイ。本番はユーザーが
Release（タグ `vX.Y.Z`）を公開したときだけ。手順・戻し方は
[docs/branching.md](docs/branching.md) と [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

### バージョン確認コマンド (VPS)
```bash
cd /root/gmo-onair && git log --oneline -1                    # 現在のコード
curl -sk https://dev.gmo-onair.jp/health                       # 検証稼働確認
curl -sk https://gmo-onair.jp/health                            # 本番稼働確認
```

### DB バックアップ・復元運用
3時間ごとの自動バックアップ（BOX保存）と復元CLIがある。手順は
[docs/ops/db-backup-restore.md](docs/ops/db-backup-restore.md)。

## UI/UX ポリシー

### レスポンシブデザイン必須
- **全ての画面はスマホ対応を前提**で設計・実装する（モバイルファースト）
- 新規UI追加・既存UI修正時は、375px幅（iPhone SE相当）でも破綻しないこと
- 具体的には以下を遵守:
  - Tailwind のブレイクポイント `sm:` `md:` `lg:` を適切に使用
  - 横スクロールが発生しうるテーブルは `overflow-x-auto` で囲む
  - フォームは1カラム縦積みを基本、広い画面で `sm:grid-cols-2` 等に展開
  - ボタン・タップ領域は最低 44px（iOS HIG基準）を確保
  - ダイアログ/モーダルは `max-h-[90vh] overflow-y-auto` で画面外はみ出し回避
  - 固定ヘッダー/フッターは `position: fixed` + `safe-area-inset` を考慮
- 実装後は DevTools のモバイルエミュレーションで動作確認
- 既存画面もレスポンシブ不備を見つけたら随時修正すること

## コード健全性ポリシー

依存関係のバージョン整合性・ビルド設定の同期・Lint基盤・TODO管理・定期セルフレビューの
方針は [docs/reviews/2026-04-28-code-health.md](docs/reviews/2026-04-28-code-health.md)
（2026-04-28 codex フルレビューからの学び）。

## デプロイ先の構成

手順は [docs/branching.md](docs/branching.md)、仕組みの中身は [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

- **VPS**: CoNoHa VPS — Docker Compose で本番 (`app_prod:3000`) と検証 (`app_dev:3001`) を並走
- **VPS のリポジトリ**: `/root/gmo-onair` (本番), `/root/gmo-onair-dev` (検証の worktree)
- **DB**: 単一 PostgreSQL を DB 名で分離 (`onair_prod` / `onair_dev`)
- **イメージ**: `ghcr.io/terai-takehiro/gmo-onair` の `:prod` / `:dev` / `:sha-<SHA>` / `:vX.Y.Z`

## セキュリティポリシー

### 絶対にやってはいけないこと
- `.env` や認証情報をGitにコミットしない（.gitignore済み）
- APIキー・パスワード・JWTシークレットをソースコードにハードコードしない
- 本番DBの接続情報を開発環境のコードやログに出力しない
- `JWT_SECRET` にデフォルト値(`dev-jwt-secret-do-not-use-in-production`)を本番で使わない

### 認証
- **切替は `AUTH_MODE` 環境変数**（`server/src/config.ts`）: `password` = Email/Password + SMS 2FA ／
  `mock` = ユーザーカード選択式。未指定なら本番（`NODE_ENV=production`）は `password`・開発は `mock`
- JWT: HTTP-only cookie + Authorization Bearerヘッダーの二重送信
- Google の資格情報（`GOOGLE_CLIENT_ID` 等）は**カレンダー連携専用**。ログインには使わない

### 環境変数の管理
- `.env.example` をテンプレートとして使用（`cp .env.example .env`）
- 本番の `JWT_SECRET` は `openssl rand -hex 32` で生成
- 本番の `DB_PASSWORD` は十分な長さのランダム文字列を使用
- Docker Compose は `.env` ファイルから自動読み込み

### 開発環境
- ローカル開発は `.devcontainer/` (Dev Containers) を使用して隔離
- コンテナ内で `npm install` + `npm run dev` が完結する構成
- ホストマシンの認証情報やSSHキーはコンテナに渡さない

## BOXフォルダ構造 (将来: 案件ごと)
未実装の将来設計。[docs/architecture/box-folder-structure.md](docs/architecture/box-folder-structure.md)。

VPS構成・ブロックアプリのパス対応は先頭の「ブロックアプリ一覧」表を参照
（重複するASCII図はここでは持たない）。
