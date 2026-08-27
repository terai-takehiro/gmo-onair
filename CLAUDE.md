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
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/` | 5179 | 凍結 | 放送CG演出・送出 (内部識別子は `awards` のまま)。**URLは生かすがトップページ・アプリ切替・左メニューには出さない**（2026-08-25〜。それ以前は「廃止」で配信も停止していた） |
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
v4.5.1 — **画面見出し（PageHeader）のタイトルが、右の操作ボタンが多い画面で1文字ずつ縦に潰れていたのを直した**（ユーザー報告のスクリーンショット: 案件を直す画面で「案件を直す」が「案件/を直/す」と3行に折り返れ、副題の案件名も幅180px程度に潰れていた）。原因は共通部品 `PageHeader`（`shared/src/client/ui/pageHeader.tsx`）のタイトル枠が `flex-1`（= `flex-basis: 0%`）だったこと — flex-wrap の行分け計算で**見出しの幅が0と数えられ**、補助操作（children）が多い画面（案件を直すは9ボタン）では同じ行に押し込まれて見出しが残り幅しかもらえなかった。実ブラウザ（Playwright + 検証用Postgres + 実サーバー）で再現し、1440pxでも副題が183pxに潰れることを実測で確認したうえで `flex-auto`（basis=内容の幅）に変更 — 入り切らないときは children が下の行へ折り返す（部品ドキュメントの「スマホでは見出しの下に折り返る」という約束どおりの挙動）。修正後を 1440/1100/375px で実測し、案件を直す（見出し全幅・ボタン折り返し・横はみ出し0）・案件一覧（タイトル横の切替と右端の主ボタンは従来どおり）・ダッシュボードに回帰がないことをスクリーンショットで目視確認済み。`PageHeader` は全アプリの v4 画面が使う共通部品のため影響範囲は shared。検証: `npm run typecheck:all`・`npm run test`（1519件）緑。 **財務②「請求・入金」の GLS番号列で、番号が長いと隣の案件名に重なって潰れて見えていたのを直した**（ユーザー報告のスクリーンショット: `GLS-A010-2608` のような回・エピソードコード付きの番号で文字が案件名と重なっていた）。原因は `RowSlot`（96px 固定幅の列）の中に置いたチェック枠/鍵アイコン＋番号の入れ子 flex に `min-w-0` が無かったこと — flex アイテムは既定で「中身の幅より縮まない」ため、`truncate` クラスを付けていても実際には省略記号が一切効かず、長い番号がそのまま列の外へ突き抜けて案件名の先頭と重なっていた（実ブラウザ・実DBで再現し、DOM実測で番号側のspanが127pxまで広がり96px枠を31pxはみ出していることを確認）。番号側のspanに `min-w-0 flex-1`、外側のラップspanに `min-w-0` を足し、96pxに収まってから省略記号（…）が出る形にした。同型のバグが案件管理⑤「見積・請求」（`InvoiceRows.tsx` のエピソードコード列）にもあったため同じPRで直した。検証: 実ブラウザ（Playwright・検証用Postgres・実サーバー）で修正前後をDOM実測し、96px枠にちょうど収まること・隣列との重なりが消えたことを確認。`npx tsc -b client`・`npm run lint`・`npm run test`（1519件）緑。 **財務⑥「受け取った書類」から見積書を除外した**（ユーザー指摘「見積書は除外したい。実際に台帳に入れるのは請求書になるので」）。この画面は見積書・請求書・注文書の3種を同じキュー（受信→確認中→承認→台帳に入れる）で扱っていたが、見積書は承認しても「台帳に入れる」の先（仕入・販管費）が無く、ワークフローを最後までたどれないまま溜まり続けていた。`financeDocService.list()`／`pendingCount()`（受け取った書類の一覧・バッジ）と、ホームの受信箱が読む `dashboard.routes.ts` の `FINANCE_DOC_BASE`（案件管理⑤受信箱・お待たせ中カウント）を同じ条件で揃え、`doc_type='quote'` を既定の一覧・件数から外した（`doc_type=quote` を明示すれば従来どおり読める＝記録は消さず監査経路のみ残す）。台帳への受け渡し（`doc-handoff.service.ts`）にも `doc_type='quote'` を弾くガードを追加し、画面をバイパスして渡そうとしても明確なエラーで止まるようにした（二重の防御）。画面の説明文・空状態の文言も「請求書・注文書」に合わせて修正し、MCP `record_finance_doc` の説明にも見積書がこの画面に既定で出ない旨を明記した。検証: 実ブラウザ・実サーバー（検証用Postgres）で見積書1件・請求書1件を投入し、一覧・受信箱・バッジ件数から見積書が消えること、`doc_type=quote` 明示指定では引き続き読めること、見積書への「台帳に入れる」が `QUOTE_NOT_HANDOFFABLE` で拒否されることを確認。`npx tsc -b client`・server typecheck・`npm run lint`・`npm run test`（1519件）緑。

v4.5.0 — **PR #439（リアルタイムCGのデモ用ダミーデータにダミー顔写真を追加した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分6秒、CI green から約49秒（作成から約2分55秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため、GitHub MCP で直接確認した）。 **案件・タスク・AI・カレンダーの根源整理（Phase 1）を実装した**（ユーザー指摘「『お待たせ中』を含むこの辺りのロジックが意味不明・案件自動整理も不要判定ができずゴミが溜まり続ける — 本当に必要な要素をシンプルに全面設計し直すこと」。設計の正は `docs/core-redesign-plan.md`）。①**案件の健全性を「ステージ×次の一手」の2軸に一本化**: 新設 `project-health.ts` がステージ別停滞しきい値（ネタ30日/仮押さえ14日/見積提案14日/口頭決定7日）・生存証拠・健全性（期限超過/停滞/スヌーズ/健全）の唯一の定義を持ち、`GET /projects` が各行に `health`/`stalled_days`/`snooze_until` を返す（7日ハードコード3か所を撤去）。一覧は3色の健全性バッジ＋「要整理」ビュー（次の一手/スヌーズ/見送り/失注の4アクション）に置き換え、スヌーズは `projects.snooze_until`（migration 238・日付必須・無期限不可）＋`PATCH /projects/:id/snooze` で設定/解除できる。②**自動整理を三段構え（可逆・通知あり・削除しない）で新設**: 日次ジョブ `project_tidy` が、生存証拠の無いネタを60日で起票者へ整理候補として通知→90日で「自動整理（長期放置）」として履歴付きで見送りに動かし（対象はネタのみ・誤爆防止）、`event_end` を過ぎた受注案件を履歴付きで完了へ繰り上げる（`GET /dashboard/check-completed` の生 UPDATE 依存を廃止）。失注理由マスタに「見送り（案件化せず）」「自動整理（長期放置）」を追加し、見送りと失注を分けた。③**「お待たせ中」を「受信箱」に改名し作り直し**: 4種混在の1本リストを種類ごとの節に分け、全行にその場のアクション（AI起票ネタ=「不要」→1クリックで見送り＝却下が AI の教師データになる・期限超過=「済んだ」）を置き、脚注「残りN件」を実数（counts）ベースに直して件数の食い違いを解消した。④**タスク期限を `due_at` に一本化**: 読み手は全員 `COALESCE(due_at, due_date+18:00)`・書き手は全員 `due_at` を書く形に統一し、投入口・依頼・GPM 由来のタスクが「期限なし」になり期限前通知（tk_due）が絶対に飛ばなかった穴を塞いだ（リンク先も `/daily/tasks` に修正）。依頼（delegation）に通知3種（作成/承諾・辞退・相談/再割当。migration 239）を追加し、全案件タスク一覧・GPM 一覧が private タスクを担当者以外に返していた漏れも塞いだ。⑤**カレンダーに「タスクの期限」レイヤー**（新API `GET /dailyops/tasks/deadlines`・自分の未完了のみ）を追加し、ダッシュボードの週間予定にも期限を併載。⑥**メール取込2種の無修正時に正解ラベル（type:'none'）を書かないバグを修正**（無修正採用率が構造的に常に0だった）。⑦**ステージラベルを `shared/src/constants/statuses.ts` の1系統に統一**（client/MCP の4系統分裂を解消）。検証: `npm run typecheck:all`・`npm run lint`・`npm run test`（shared の新テスト31件含む）緑、検証用 Postgres で migration 238/239 の適用と冪等性を確認。 **PR テンプレートの「凍結アプリ」欄が古いままだったのを直した**（ユーザー指摘「client-techops/ は凍結ではないし、計時LIVEはアプリマージされて機能はもう復活している。Readme含めたドキュメント記載やルールが正しくない」）。`.github/pull_request_template.md` の「凍結アプリ (Qシート / 計時LIVE / リアルタイムCG) を触った場合」の節と「影響範囲」の凍結チェックリストが、制作技術支援（Qシート）・計時・視聴者（計時LIVE）を今も凍結アプリとして挙げていたが、ルート `CLAUDE.md`「ブロックアプリ一覧」・`shared/CLAUDE.md`（「凍結アプリは0個になった（v4.2.0時点）」）の実態と食い違っていた（制作技術支援は v4.1 段3で凍結解除・計時・視聴者は共通シェル＋v4トークンへ載せ替え済み。凍結中なのはリアルタイムCG（`client-awards/`）だけ）。節見出しをリアルタイムCGだけに絞り、制作技術支援・計時・視聴者は「v4.0.0 の対象」チェックリストへ移し（それぞれの残作業・例外（計時・視聴者は表示画面 `/live/display/` だけ見た目を変えない）を1行で明記）、経緯をコメントで残した。README.md・ルート CLAUDE.md 本体は元々正しい記載だったため変更不要。 **PR #442（案件・タスク・AI・カレンダーの根源整理 Phase 1）と PR #443（PR テンプレートの凍結アプリ欄修正）のマージ後の棚卸しを記録した**（コード変更なし）。#442 は作成からCI green まで約2分3秒、CI green から約15分19秒（作成から約17分22秒）、#443 は作成からCI green まで約2分3秒、CI green から約1分37秒（作成から約3分40秒）で、いずれもterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため GitHub MCP で直接確認した）。 **案件・タスク・AI・カレンダーの根源整理（Phase 2）を実装した**（設計の正は `docs/core-redesign-plan.md` の Phase 2。Phase 1 = v4.4.6 の続き）。①**「今日の営業」カードを案件管理ダッシュボードの主役にした**: 新API `GET /dashboard/today-sales` が「期限が来た次の一手（超過＋今日）・今日スヌーズ明け（過去7日帯）・止まり始めた案件（stalled）」の3集合を1回で返し（判定は Phase 1 の `project-health.ts` を import 再利用・GLS-A 限定）、PC はページ最上部・スマホも最上部に同カードを置いた。同じ集合を2枚で数えないよう旧「期限超過の次の一手」パネル（OverduePanel）は削除し、「済んだ」ボタン・行クリックの導線は引き継いだ。GPM 一覧の行にも `health`/`stalled_days`/`snooze_until` を追加し、「おすすめ順」の停滞判定を旧 `STALE_DAYS`×更新日時の近似から健全性の単一定義に置き換え、3見え方（リスト/カード/ボード）に健全性バッジを付けた（`STALE_DAYS` は削除）。②**AI活動ページ（/settings/ai-activity）＋営業側の月次AIレビューを新設**: 新API `/ai-activity`（digest/recent/reviews・営業系9種+デイリーニュースのみ受け付け qsheet 系は構造で秘匿）を人間向け画面にし、直近の出力（無修正採用/修正あり/却下/未確認の状態バッジ）・kind ごとの無修正採用率とよく直される項目・月次レビューの確認打刻（sales manager）を1画面で見せる。夜間ジョブ `sales_ai_review`（月1・03:35）が営業系 AI 出力の digest から `ops_reports` に月次レビュー下書きを起こし営業マネージャーへ通知する（migration 241）。デイリーニュースの AI 投稿（`add_ops_report_items`）も `ai_outputs` に記録して採用/削除がループに乗るようにし、AI 経由の起票系ツール6種に `prompt_version` を通せるようにした。制作技術支援には AIナレッジ承認ページ（/techops/ai-knowledge・manager が draft を承認/却下すると版が進んで次の生成に載る）を追加。③**依頼のコメントスレッド・担当割当・ICSカレンダー連携**: 依頼タスクに当事者だけが読み書きできるコメント（`task_comments`・migration 240・相手方に通知 dg_comment）を付け、承諾/辞退のメモも description 追記からコメントに変えた。標準工程の適用ダイアログと議事録の持ち帰り行で生成時に担当者を選べるようにした（選ばなければ従来どおり未割当）。個人のタスク期限を外部カレンダーに出す ICS フィード（`user_task_feed_tokens`・`/schedule/task-feeds/:token.ics`・設定→通知で発行/再発行）を追加した。検証: `npm run typecheck:all`・`npm run lint`・`npm run test` 緑、検証用 Postgres で migration 240/241 の適用と冪等性、実サーバーで today-sales・ai-activity・コメントの403・ICS 配信・月次レビュー下書き作成を実測。 **PR #444（棚卸し記録）と PR #445（根源整理 Phase 2）のマージ後の棚卸しを記録した**（コード変更なし）。#444 は CI green から約1時間12分後、#445 は作成からCI green まで約2分12秒・CI green から約8分15秒（作成から約10分27秒）で、いずれもterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため GitHub MCP で直接確認した）。

v4.4.9 — **リアルタイムCG（凍結中）のデモ用ダミーデータに、画像部分へ入るダミーの顔写真を追加した**（ユーザー要望「運用の際に画像部分にダミーの顔写真を入れられるようにしたい」）。`server/src/shared/db/seed-awards.ts` が開発・検証環境に自動投入するデモの37エントリは、これまで `photo_url` が未設定で、CG画面では初期文字だけのグラデーションプレースホルダー（`PortraitPlaceholder.tsx`）しか映らず、実際の放送CGの見え方をデモしづらかった。実在の人物写真は権利・プライバシー上使えないため、髪型・肌色・背景色をコードで組み合わせたイラスト調のアバター（架空の人物）をSVGで16種類生成し、通常の写真アップロードと同じ配信経路（`UPLOAD_DIR` 直下 + `/api/v1/internal/awards/images/:filename`）に載せて全37エントリに使い回しで割り当てた。検証: `npm run typecheck --workspace=server`・`npm run lint`・`npm run test`（1465件）を確認済み。実サーバー（検証用Postgres、フレッシュな状態から）で `db:seed:awards` を実行し、全37エントリに `photo_url` が入ること・再実行時にスキップされる（冪等性）ことを確認。実サーバーを起動して `GET /api/v1/internal/awards/images/dummy-avatar-01.svg` が `200 image/svg+xml` で返ること、公開エンドポイント `GET /api/v1/internal/awards/events/1/output` の各エントリに `photo_url` が入っていることも確認済み。生成したアバター画像をブラウザで実際にレンダリングし、見た目を目視確認済み。


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
