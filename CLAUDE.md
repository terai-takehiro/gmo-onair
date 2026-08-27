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
v4.5.3 — **PR #457（PR #456 の棚卸し記録）と PR #458（案件台帳の項目整理とバグ修正）のマージ後の棚卸しを記録した**（コード変更なし）。#457 は作成から `build` green まで約26秒（`checks` の完了は待たずマージ）、#458 は作成からCI green まで約2分23秒、CI green から約1分18秒（作成から約3分41秒）で、いずれもterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は401エラーで実行できなかったため、GitHub MCP で直接確認した）。 **PR #459（棚卸し記録）と PR #460/#461（release: v4.5.2）のマージ後の棚卸しを記録した**（コード変更なし）。#459 はレビュー0件のまま terai-takehiro 本人が手動マージ（作成から約2分43秒後）。v4.5.2 の版上げは最初 `claude/release-prep-lod7ck` 枝で #460 として出したが、CI の `check-changelog.mjs` がリリースPRと判定する条件（`RELEASE=1` か枝名が `release/` で始まること）に外れて `checks` が落ちたため、`release/4.5.2` 枝に出し直し #461 として再オープンした（#460 はクローズ、マージなし）。#461 もレビュー0件のまま手動マージ（CI green から約1分12秒後）。`docs/reviews/codex-findings-v4.md` に各PRの経緯を記録した。 **カレンダーの重複予約を、表記揺らぎごと拾えるようにした**（ユーザー報告「複数の経路からの予約により重複した内容のカレンダーが貼り付くことが多々あり、表記揺らぎがあったりするので工夫を」）。スタジオ予約は「案件ステージ移行での自動生成」「MCP（メール取込・チャットでの依頼）」「人の手入力」の複数経路から作られるが、後者2つには重複防止が無く、同じ枠を指す予約が題名の言い回しだけ違う形（「収録」/「本番」・語順違い・全角半角違い）で二重に入ることが多々あった。完全一致の突合では拾えないため、①題名を NFKC 正規化＋よくある同義語（本番=収録・リハ=リハーサル等）で寄せてトークン化し、Jaccard 類似度で近さを見る純粋関数（`server/src/shared/services/bookingDuplicate.ts`）を新設、②時間帯が重なり、かつ「同じ案件」または「部屋が重なって題名も似ている」組を重複疑いとして判定する（部屋も案件も手がかりが無い組は誤検知防止のため拾わない）。方針は営業時間外の印（`out_of_hours`）と同じ「止めない」— 予約作成・更新は失敗させず、`possible_duplicate` 系の列に印を残すだけ（migration 244）。作成時と、題名・時刻・部屋・案件のいずれかを直したときに再判定し、画面はダイアログ保存時のトースト（「重複の疑いがある予約です」）と、新設のカレンダー⑤「重複疑い」一覧（`/calendar/duplicates`・仮押さえ一覧と同型）の両方で気づける。一覧からは「別物として確認済みにする」（印だけ外す・予約は残る）と削除ができる。MCP `create_studio_booking` の説明にも、重複していても保存は止まらず `duplicate_check` に印が付くだけである旨を明記した。検証: `npm run typecheck`（server/client とも緑）、`npm run test`（新設 `shared/tests/bookingDuplicate.test.ts` 14件を含め全1497件緑・表記揺らぎ／語順違い／隣接時間帯の非重複／案件のみ一致・部屋のみ一致それぞれの分岐を固定）。 **プロジェクト管理（GPM）にガントチャートとかんばんを載せ、MCP をガントの細部編集に対応させた**（ユーザー指摘「むしろガントチャート、カンバン管理が必要なのはプロジェクト管理」）。プロジェクト詳細の概要タブに見え方の切り替え（リスト／ガント／かんばん・PC のみ）を追加した。①**ガント**は工程（`gpm_phases` の開始・終了日）とタスクを1本の時間軸に出し、バーのドラッグで日程ごと移動・端をつまんで期間変更ができる（工程は `PUT /gpm/phases/:id` の部分更新・タスクは `start_date`/`due_date`。開始日の無いタスクを動かしたときは期限だけ動かし「期限だけ決めてある」形を壊さない）。◆マイルストーン・進捗%の塗り・今日線つき。②**かんばん**は工程を列・タスクをカードにし、ドラッグで工程の付け替え（`gpm_phase_id`）・カードで完了チェック・列ごとの「タスクを足す」ができる（案件側の自由カラムは持ち込まない — 工程と食い違う第2の分類を作らないため）。③**MCP**: `list_gpm_tasks`/`get` が `start_date`/`progress`/`is_milestone` を返すようになり、`create_gpm_task`/`update_gpm_task` がガント用の細部（開始日・進捗%・◆・止まり方 `work_state`・並び `sort_order`）をそのまま受ける（従来は「案件タスク側の `update_task` で」と迂回させていた）。GPM の作成時に旧 `due_date` 列にも期限を書くようにし、案件詳細側ガントで「未スケジュール」に見えた食い違いも直した。AI 起票タスクの修正差分（`gpm-ai-feedback`）にも開始日・マイルストーンを追加し、AI がひいた線表を人がどう直したかがループに乗る。 **PR #463（カレンダーの重複予約を表記揺らぎごと検知できるようにした）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分37秒、CI green からマージまで約2時間3分空いたが、`get_reviews`・`get_review_comments` とも終始0件のまま terai-takehiro 本人が手動マージしたことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため GitHub MCP で直接確認した）。 **PR #464（プロジェクト詳細にガント・かんばんを追加し、MCP をガント編集に対応させた）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分14秒、CI green からマージまで約7分21秒（作成から約9分35秒）で terai-takehiro 本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は GitHub 401 のためこの環境から実行できず、GitHub MCP で直接確認した）。

v4.5.2 — **プロジェクト管理（GPM）の MCP ツール一式整備・カレンダー週表の短い予約対応・案件台帳（57列）の整理（Phase A〜C）をまとめてリリースした**。①これまで1本も無かった GPM の MCP ツールを40種新設（プロジェクト・工程・タスク・見積・議事録・BOXフォルダのCRUD、かんばん列、体制の並び替え）し、直後のマルチエージェントレビューで見つかった権限漏れ（案件のBOXファイルが読めていた）・エラー握りつぶし・並び替えの検証漏れの3件も修正した。②カレンダー週表で短い予約（10分など）が読めなかったのを直し、なぞって新規登録・下端を引いて延長できるようにした。あわせて日またぎ予約の消失・重複予約の重なり・不正な時刻の保存など実在バグ多数を2弾に分けて修正した。③会場・スタジオの表記ゆれを機に案件台帳57列を棚卸しし、読み手ゼロの死んだ列10本の削除・実バグ6件の修正・会場入力のガードレール追加・受注/失注日時やステージ変更ロジックの一本化（Phase A〜C）を行った。

v4.5.1 — **画面見出し（PageHeader）のタイトルが、右の操作ボタンが多い画面で1文字ずつ縦に潰れていたのを直した**（ユーザー報告のスクリーンショット: 案件を直す画面で「案件を直す」が「案件/を直/す」と3行に折り返れ、副題の案件名も幅180px程度に潰れていた）。原因は共通部品 `PageHeader`（`shared/src/client/ui/pageHeader.tsx`）のタイトル枠が `flex-1`（= `flex-basis: 0%`）だったこと — flex-wrap の行分け計算で**見出しの幅が0と数えられ**、補助操作（children）が多い画面（案件を直すは9ボタン）では同じ行に押し込まれて見出しが残り幅しかもらえなかった。実ブラウザ（Playwright + 検証用Postgres + 実サーバー）で再現し、1440pxでも副題が183pxに潰れることを実測で確認したうえで `flex-auto`（basis=内容の幅）に変更 — 入り切らないときは children が下の行へ折り返す（部品ドキュメントの「スマホでは見出しの下に折り返る」という約束どおりの挙動）。修正後を 1440/1100/375px で実測し、案件を直す（見出し全幅・ボタン折り返し・横はみ出し0）・案件一覧（タイトル横の切替と右端の主ボタンは従来どおり）・ダッシュボードに回帰がないことをスクリーンショットで目視確認済み。`PageHeader` は全アプリの v4 画面が使う共通部品のため影響範囲は shared。検証: `npm run typecheck:all`・`npm run test`（1519件）緑。 **財務②「請求・入金」の GLS番号列で、番号が長いと隣の案件名に重なって潰れて見えていたのを直した**（ユーザー報告のスクリーンショット: `GLS-A010-2608` のような回・エピソードコード付きの番号で文字が案件名と重なっていた）。原因は `RowSlot`（96px 固定幅の列）の中に置いたチェック枠/鍵アイコン＋番号の入れ子 flex に `min-w-0` が無かったこと — flex アイテムは既定で「中身の幅より縮まない」ため、`truncate` クラスを付けていても実際には省略記号が一切効かず、長い番号がそのまま列の外へ突き抜けて案件名の先頭と重なっていた（実ブラウザ・実DBで再現し、DOM実測で番号側のspanが127pxまで広がり96px枠を31pxはみ出していることを確認）。番号側のspanに `min-w-0 flex-1`、外側のラップspanに `min-w-0` を足し、96pxに収まってから省略記号（…）が出る形にした。同型のバグが案件管理⑤「見積・請求」（`InvoiceRows.tsx` のエピソードコード列）にもあったため同じPRで直した。検証: 実ブラウザ（Playwright・検証用Postgres・実サーバー）で修正前後をDOM実測し、96px枠にちょうど収まること・隣列との重なりが消えたことを確認。`npx tsc -b client`・`npm run lint`・`npm run test`（1519件）緑。 **財務⑥「受け取った書類」から見積書を除外した**（ユーザー指摘「見積書は除外したい。実際に台帳に入れるのは請求書になるので」）。この画面は見積書・請求書・注文書の3種を同じキュー（受信→確認中→承認→台帳に入れる）で扱っていたが、見積書は承認しても「台帳に入れる」の先（仕入・販管費）が無く、ワークフローを最後までたどれないまま溜まり続けていた。`financeDocService.list()`／`pendingCount()`（受け取った書類の一覧・バッジ）と、ホームの受信箱が読む `dashboard.routes.ts` の `FINANCE_DOC_BASE`（案件管理⑤受信箱・お待たせ中カウント）を同じ条件で揃え、`doc_type='quote'` を既定の一覧・件数から外した（`doc_type=quote` を明示すれば従来どおり読める＝記録は消さず監査経路のみ残す）。台帳への受け渡し（`doc-handoff.service.ts`）にも `doc_type='quote'` を弾くガードを追加し、画面をバイパスして渡そうとしても明確なエラーで止まるようにした（二重の防御）。画面の説明文・空状態の文言も「請求書・注文書」に合わせて修正し、MCP `record_finance_doc` の説明にも見積書がこの画面に既定で出ない旨を明記した。検証: 実ブラウザ・実サーバー（検証用Postgres）で見積書1件・請求書1件を投入し、一覧・受信箱・バッジ件数から見積書が消えること、`doc_type=quote` 明示指定では引き続き読めること、見積書への「台帳に入れる」が `QUOTE_NOT_HANDOFFABLE` で拒否されることを確認。`npx tsc -b client`・server typecheck・`npm run lint`・`npm run test`（1519件）緑。


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
