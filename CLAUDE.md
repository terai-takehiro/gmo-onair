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
v4.5.18 — **マルチエージェントの全方位レビューで確認した不具合111件をまとめて修正し、死蔵コード・未使用依存を棚卸しした**。14観点（財務・GPM・制作系サーバー、認証認可、SQLインジェクション/XSS、DBスキーマ、状態管理、UI/レスポンシブ、性能、エラー処理）の並列調査で144件を検出→全件を敵対的検証にかけ130件を確認。⚠️ お金に直結するものだけでも: グループ請求の削除で売上・仕入が二重計上される／全社の月次損益からグループ請求（按分）が丸ごと抜ける／請求書HTMLが見積段階の売上まで合算し契約一括は¥0で出る／請求書・見積書の消費税が税区分・丸め設定を無視した固定10%／getSummary が見積段階の売上を粗利に含める、の5件が本番で実害を出しうる状態だった。ほかにテロップCG・クイズの Socket.IO 無認証操作、MCP 読み取りツールの権限すり抜け、機材の書き込みが reader 権限で通る等の権限穴、計時タイマーが再接続後に凍る不具合、props→useState 再同期漏れの残り、UTC日付の1日ずれ32箇所、per-keystroke検索のdebounce化、N+1・同一テーブル多重走査の解消などを実装。掃除では 0参照のコンポーネント・スクリプト19ファイルを削除し、未使用依存（recharts・chart.js・react-chartjs-2・@radix-ui 2種）で38パッケージを削減。全容と棚卸しは [docs/reviews/2026-09-01-multiagent-app-review.md](docs/reviews/2026-09-01-multiagent-app-review.md)。検証: typecheck:all・shared テスト1941件（新規4件含む）・lint・build:changed 全通過。

v4.5.17 — **#528 のレビュー棚卸しを記録し、この連鎖をここで止めることにした**。#528（棚卸しの PR そのもの）も **`get_reviews` / `get_review_comments` とも0件**でマージされた。⚠️ **「レビュー0件を記録する PR」も必ずレビュー0件になるので、そのたびに新しい PR を出すと無限に続く** — 足した1行が**自分自身も含む記録**であることを明記し、以後は棚卸しの PR について書かない形にした。⚠️ **本当の問題は記録の書き方ではない** — 2026-09-01 の1日だけで **#512・#514・#515・#517・#520・#522・#523・#524・#526・#527・#528 の11本が、1件のレビューも無くマージされている**（うち #526・#527 は +2,673 / −1,955・28 ファイル）。**書き出す運用は回っているが、レビューが届く運用は回っていない**ことを表に残した。 **#529（見積・売上・仕入の改善4件）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。⚠️ **約2分半でマージされ、`get_reviews`・`get_comments` とも0件**（API で直接確認。`npm run reviews:debt` はこの環境のトークンでは 401）。画面上「レビュー0件」は「読まれて問題なし」と**見分けが付かない**ので、事実として書き出した。見積の受注→売上変換・見積明細の定価表記・「回を足す」の採番というお金と一意性に関わる変更を含むため、**レビュー0件のぶんを埋めるために、意図して残した判断・未検証のまま入れたもの4件を自分で書き出した**（実ブラウザでの動作確認なし／実 Postgres での保存→読み直し確認なし／権限403の確認なし／売上上書きの同時実行競合は未検証）。 **プロジェクト管理（GPM）で「プロジェクトを直す」「未確認事項を直す」を開いたまま案件を切り替えると、古い値のまま出ていたのを直した**（ユーザー報告「案件管理で案件を直すのページ、リロードしないと適切な情報が表示されない」）。⚠️ **原因は`key`の付け忘れ** — `GpmProjectDetailPage.tsx`が`EditProjectDialog`/`OpenItemDialog`を呼ぶときに対象データの`key`を渡していなかったため、ダイアログを開いたまま裏で対象の案件・未確認事項が変わっても、`useState`の初期値（`project.name`など）に固定されたまま再同期されなかった。呼び出し側で`key={p.id}` / `key={askEdit?.id ?? 'new'}`を渡し、対象が変わったら確実に作り直すようにした。 **props を useState の初期値にコピーするだけで key も再同期も無い「開いたまま裏で古い値が残る」不具合を、マルチエージェント調査で洗い出した8件まとめて直した**（前回の GPM「プロジェクトを直す」修正の横展開）。⚠️ **単に古い値が見えるだけでなく、実際にロストアップデート（保存で直前の更新を巻き戻す）や誤った対象への保存につながる箇所があった** — GPM の工程・タスク編集ダイアログ（隣接ボタンの連打で直前の状態変更を巻き戻す）、案件管理の按分グループ編集（裏の更新を古い値で上書き保存）、日常業務の内覧会・ニュース・セキュリティカード編集（対象を切り替えても前の値が残る／保存が別対象に混入する）、制作技術支援の立ち位置図エディタ（複製保存後に続けて編集すると複製ではなく元テンプレを上書き）・スケジュールひな形設定（ひな形を切り替えても列選択が前のひな形のまま残り、別ひな形の列へ項目を追加しうる）。呼び出し元に `key` を足し、対象データが react-query 等で裏から更新されうる箇所はコンポーネント内部にも props→state の再同期 `useEffect` を追加した。調査は8領域を並列に洗い出し・候補ごとに独立検証するワークフローで行い、17件の候補のうち9件は「呼び出し元に key がある」「対象が不変」等の誤検知として除外した。 **レギュラー案件（回が積み上がるシリーズ）の残タスク5〜8を仕上げた**（[docs/design/v4/regular-series.md](docs/design/v4/regular-series.md) §10。1〜4は本番実害対応として別PRで先に直し済み — GLS-A007が受注11分後に日次ジョブで完了へ落ちかけた不具合など）。①**回の一括生成**を「頻度（毎週/隔週/第N◯曜日）×期間×1日あたりの本数」から日程を組んでプレビュー→作成できるようにした。②案件（シリーズ）が持つ**4つの取り決め**（収録の頻度・1日の本数・固定セット・回の単価・請求サイクル）を案件に持たせ、作成/編集画面と一括生成の初期値に配線した。③**請求まとめ**: SQLiteの`GROUP_CONCAT`を使ったままPostgreSQLで必ず500になっていた請求グループAPI（`/invoice-groups/auto-by-recording-date`）を`string_agg`に修正し、あわせて回が2件以上紐づくと同じ理由で500になる集計サブクエリの既存バグも直した上で、**月末締めの請求グループ作成API**（`auto-monthly-close`）を新設した。④レギュラー回向けの**標準工程テンプレート3ブロック**（収録準備／収録当日／編集・納品）を用意し、既存の`task_column_templates`の仕組みに乗せて回へ適用できるようにした（`episodes.status`への書き込みは行わず、将来のKanban6状態化に向けた土台のみ）。検証はverify用Postgresでの実サーバー起動・curl/psqlによる実地確認を各段階で実施、`npm test`（144ファイル1937テスト、新規19件含む）・`typecheck:all`・`build:changed`は全て通過。 **レギュラー案件（回が積み上がるシリーズ）の残タスク（[docs/design/v4/regular-series.md](docs/design/v4/regular-series.md) §10・PR #535）で出た積み残し4項目を仕上げた。** ①**放送日オフセットを案件（シリーズ）の取り決め値として持てるようにした**（`projects.broadcast_offset_days`）。回作成時の優先順位を「リクエスト明示 > 案件の取り決め > 決め打ち既定値7日」にし、あわせて**回の作成（受注時の第1回自動作成・頻度一括生成の両方）に標準工程テンプレートの自動適用を配線した**（テンプレート適用の失敗は回の作成自体を失敗させない設計）。②**請求まとめの画面口**を案件詳細/見積タブに新設（月末締め・収録日ごと・契約一括の3種をダイアログから実行。着手前はこの機能に画面が1つも無かった）し、**契約一括**（`billing_cycle='contract_lump_sum'`）向けに回に金額を持たせない案件単位の請求（`invoice_groups.lump_sum_amount`）を追加、既存5箇所の合計金額計算を統一した。③**MCPの`update_project`のZodスキーマ欠けを埋めた** — `contact_name`/`intake_channel`/`intake_confidence`/`attendee_count`/`goal`の5項目に加え、洗い出す過程で**既存の穴を2件発見**（`box_url_internal`/`box_url_external`はPR #475でUPDATE_FIELDSに入った時点からZodスキーマに一度も無く、Zodに無いキーはMCP SDKがリクエスト受信時点で黙って剥がすため`ignored_fields`にすら出ない＝**MCP経由で指定しても何も起きないのに成功したように見える**状態だった）。④**375px実機でPlaywright操作による確認**を行い、契約一括ダイアログの金額欄で**ラベルと入力欄が結びついていない**不具合を発見・修正（`CurrencyInput`が`id`プロパティを内部`<input>`へ渡していなかった）。検証は各項目とも verify用Postgres上で実サーバー起動・API直叩き/実ブラウザ操作による実地確認を実施、`npm test`（144ファイル1937テスト全合格）・`typecheck:all`・`lint`・`build:changed`は全て通過。

v4.5.16 — **財務まわりで実際に起きていた不具合をまとめて潰し、レギュラー案件を動くようにした**（13本）。⚠️ **本番で 500 になっていた不具合が1件あった** — 仕入の検索と仕入先での並べ替えが、検索語を入れると必ず失敗していた（`v.name` が未定義の別名。Excel・MCP も同じ経路）。あわせて①「サーバー側で処理が止まりました」を**混み合っている(429)・時間切れ(504)・壊れた(500)**に見分けられるようにし、②台帳の検索が**1文字ごとに問い合わせていた**のと**一覧APIが同じ表を5回走査していた**のを直し、③**DATE 列が時間帯を設定した日に25列まとめて1日ずれる**状態を塞ぎ、④役務提供完了日を Excel・CSV・MCP から扱えるようにした。⚠️ **レギュラー案件は「選べるのに効かない」状態だった** — `recurrence='regular'` を分岐に使う箇所がサーバー全体で0件で、しかも**受注した瞬間に日次ジョブが完了へ落としていた**（本番で観測・11分後）。ロジックを決めて実装した。あわせて GPM の請求タブ（**2,032行**）を役割ごとに**227行**まで分け、見積の版を重ねて受注すると売上がダブルカウントされる不具合も直した。⚠️ **この版の11本は、1件のレビューも無いままマージされている**（記録は [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md)）。全文は下のアーカイブに。


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
