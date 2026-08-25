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
v4.4.6 — **案件から請求書Excel（業務推進提出用）を出す道が、v4のいくつかの画面で無くなっていたのを直した**（ユーザー指摘「請求書のExcelが出力できなくなっている」）。バックエンドの `GET /revenues/:id/excel` 自体は生きていたが、v4でレガシーの全機能コンソール（`BusinessProjectView.tsx`）を新しい画面に置き換えたとき、見積書・請求書・検収書PDFの3ボタンは戻したのに、4つ目の請求書Excelボタンだけ戻し忘れていた。同じ抜けが3画面（案件詳細＞見積タブの「売上・請求」ペイン・⑤見積・請求（全案件）・財務②締め処理）にあり、Excel出力に届く道が、旧GLS-B月次案件とGPMの請求タブ（今も旧コンソールを使う）だけに残っていた。PDF発行の共通部品（`lib/docPdf.ts`／`DocPdfButton.tsx`）と同じ形で `downloadRevenueExcel` と `DocExcelButton` を新設し、3画面に既存のPDFボタンと並べて追加した（Excel出力はBOXに保存しないため、その旨をボタンの文言では言わないようにしている）。検証: 型検査・実サーバーで対象の売上IDに対する `/revenues/:id/excel` が200＋有効なxlsxを返すことを確認済み。**見積の版をアーカイブ（一覧から非表示に）できるようにした**（ユーザー要望「過去バージョンなどをアーカイブ化する機能をつけたい」）。見積は版を重ねるほど古い版が一覧に積み上がり、いま見たい版（最新のdraft・sent）が埋もれていた。`estimates.archived_at`（migration 236）を新設し、`status`（draft/sent/accepted/rejected/superseded）とは独立した「一覧に出すかどうかだけ」の印にした（アーカイブしても送付・受注の記録は変わらない）。既定の一覧はアーカイブ済みを除き、「アーカイブした版を表示する」で戻せる。案件詳細の見積タブ・GPMの見積タブ両方に対応（GPMもサーバー側は同じ `estimate.service.ts` を呼んでいるため）。EstimateTab.tsxが400行を超えたため、版の一覧描画を `EstimateVersionList.tsx` に分離した。検証: 実サーバー・実DBで作成→次の版作成→旧版アーカイブ→一覧から消える→表示切替で戻る→アーカイブ解除まで一通り確認（案件側・GPM側の両方）。`npm run test`（1465件）・型検査・lintを確認済み。**財務管理（売上・仕入台帳）の一覧行から案件を開くボタンが実質使えなくなっていたのを直した**（ユーザー指摘「一覧表示時に設定しているリンクへ飛べるボタンを追加（以前はあったもの）」）。共通の行部品 `LedgerRows.tsx` の型は「行を押すと案件が開く」とコメントされていたが、実際は編集権限のあるユーザーが行を押すと編集ダイアログが開くだけで案件へは行けず（`RevenueListPage.tsx`）、仕入では編集権限が無いユーザーが押しても何も起きなかった（`PurchaseListPage.tsx`）。行のクリック挙動（`onOpen`）とは独立した小さなリンクボタンを行内に追加し、`project_id` があれば誰でも案件を開けるようにした。検証: 型検査・実サーバーでデータの存在を確認済み（クライアントのみの変更のためブラウザでのクリック確認は未実施）。 **PR #429（見積のアーカイブ・請求書Excel出力・財務一覧の案件リンクを直した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分2秒、CI green から約27分57秒（作成から約29分59秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。

v4.4.5 — **見積の明細で数量に小数を入れると「サーバー内部エラーが発生しました」となり発行できなかった不具合を直した**（ユーザー指摘「見積もりの発行ができない（サーバー内部エラーが発生しました が表示される）」）。明細の「数量」欄は `type="number"` の入力欄で小数も打てるが、`estimate_items.quantity` は INTEGER 列で、サーバー（`estimate.service.ts` の `replaceItems`）は同じ行にある「単価」は `Math.round` で丸めているのに**数量だけ丸めずに渡していた**ため、たとえば半日利用のつもりで「0.5」を打つと保存の時点で Postgres が `invalid input syntax for type integer` を返し、それがそのまま画面の「サーバー内部エラーが発生しました」になっていた（明細が保存できないため、その先の PDF 発行にも進めない）。検証用DB・実サーバーで実際に `quantity: 0.5` を送って 500 を再現したうえで、単価と同じ `Math.round` を数量にも通すよう修正し、保存→PDF発行まで通ることを確認した。あわせて画面側の数量欄も `step="1"` を付けて丸めてから送るようにし、打った小数がそのまま送られないようにした。検証: `npm run test`（1462件）・`npm run typecheck`・実サーバー（検証用Postgres）で `quantity: 0.5` の保存→見積書PDF発行が通ることを確認済み。**見積の「版」の仕様を見直し、送っていない下書きが編集できなくなる不具合を直した**（ユーザー指摘「次の版をつくると過去の版はお客様に出したことにしていなくとも編集ができなくなる」）。`createNextVersion` が前の版を無条件に `superseded`（旧版・編集不可）にしていたため、`draft`（未送付）の状態で「次の版をつくる」を押しただけで、まだお客様に出していない下書きまで編集不能になっていた。前の版を `superseded` にするのは**`sent`（送付済み）から次の版をつくったときだけ**に限定し、`draft` から次の版をつくったときは前の版を `draft` のまま残す（＝そのまま編集できる）よう修正。これにより「並行して複数の版を作る」「1案件を意図的に複数の見積に分ける（本編・ケータリング等）」運用もそのまま行える（後者は「見積をつくる」ボタンを複数回押すことで元々可能だったため、説明文を追記した）。承認判定・売上への変換・PDF発行など周辺コードが「1系列に下書きは最大1件」を仮定していないことも確認済み。**見積の明細に「終了日」を追加し、期間を全行にコピーする機能・列見出しの明確化・カテゴリの自由入力を実装した**（ユーザー要望4件）。明細の日付欄が開始日1つだけだったため、`estimate_items.item_date_end`（任意・後方互換）を追加し、開始日・終了日を別々に入力できるようにした（migration 235）。1行の期間をボタン1つで全行にコピーする機能、常時表示になった列見出し（数量・単価・仕入・金額が何を指すか送付済み・閲覧時も分かるように）、固定3カテゴリに加えて任意の名前のカテゴリを追加できる導線も実装。見積書PDFの明細取得クエリで `item_date`/`item_date_end`（DATE列）が pg から文字列ではなく Date オブジェクトとして返り、日付を入れた行のある見積のPDF発行が "d.split is not a function" で500になる不具合も実装後の実DB検証で見つけて修正した（`to_char` で文字列化。`sent_at` と同じ既知の落とし穴で、明細一覧の取得側にも同じ問題があったため合わせて直した）。**案件管理＞見積＞売上・請求ページから仕入を追加できるようにした**（ユーザー要望）。このペインは「読むだけ」が設計方針だったため、仕入の編集フォームを新設せず、財務②仕入台帳が使っているダイアログ・APIをそのまま再利用して「新規登録の入口」だけを追加した（編集・削除は台帳側のまま）。**案件一覧の絞り込み「全て（進行中）」を「すべて」「進行中」に分け、「すべて」で終了・失注案件も出るようにした**（ユーザー指摘）。既定は従来どおり「進行中」。実DBで失注案件を作って両チップの絞り込み結果を確認済み。**財務ダッシュボードの内訳が実質100件までしか出ない不具合と、絞り込みの案件プルダウンにGLS-A004のような開催済み案件が出てこない不具合を直した**（ユーザー指摘、再現例「GLS-A004 GMOアワード2026」）。共通のページング処理（`extractPagination`）が `limit` を無条件に100件へ切っており、ダッシュボードの内訳・案件プルダウン（`/projects?limit=500`）とも実際には100件しか返っていなかった。案件プルダウンは上限のない `GET /projects/won-projects` に切り替え、内訳（売上・仕入・販管費）は折りたたみ→展開→「さらに読み込む」の3段UIでサーバーの実ページを追加取得できるようにした。実DBで売上・仕入のページングAPI、`won-projects` の返り値を確認済み。検証: 上記いずれも `npm run typecheck`（client/server）・`npm run test`（1465件）・`npm run lint`（0エラー）・`npm run build:changed`・`npm run check:version` を確認済み。見積まわり（版の仕様見直し・明細の終了日・PDF発行・数量丸め）は検証用Postgres実DBで作成→保存→PDF発行→次の版作成→旧版の再編集まで一通り確認した。案件一覧の絞り込み・財務ダッシュボードの案件プルダウンも実DBで確認済み。売上・請求ページの仕入追加は既存の仕入登録フローをそのまま再利用しているため型検査・テストのみで、実ブラウザでのクリック確認はしていない。

v4.4.4 — **多エージェント監査で見つかったロジック不具合25件を直した**（ユーザー指摘「こういったロジックミスが多発しています。アプリ全体をマルチエージェントで総点検してください」）。件数の不一致（バッジと実際に開いた先の件数が合わない）・行き止まりの導線（押した先にその場で処理する手段が無い）・invalidateの取りこぼし（直したのに一覧が古いまま）の3パターンを中心に、財務・カレンダー・プラットフォーム・GPM・日常業務・機材管理・制作技術支援・計時視聴者・共通ライブラリ・案件管理の10領域を並行するWorkflow（多エージェント）で点検・修正し、10本のPRに分けて対応した。計時視聴者の1件は**P1**（計測中の番組を削除すると計測ロックが永久に解放されない）。全PRとも実ブラウザ・実DBでの動作確認はこのセッションから未実施。**1件ずつの詳細は下のアーカイブに全文あります**。


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
