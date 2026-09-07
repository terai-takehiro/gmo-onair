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
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（URL到達不可） | — | **廃止** | 放送CG演出・送出。**後継の「テロップCG」（`client-techops/src/pages/graphics/`）へ機能を移し終え、2026-09-06 に段F（畳み込み）を実行して廃止した。** コードは参照用にリポジトリへ残すが、サーバーの配信・API・Socket.IO・ビルド対象・画面上の入口をすべて外し、Webサイトのどこからも到達できない。過去実績データ（`awards_events`等）はDBに残っており、テロップCG側の移行ツール（設定＞連携＞過去実績の移行。system_admin限定）が読む。経緯は [docs/v4-plan.md](docs/v4-plan.md) の「用語」 |
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
- **バックエンド**: Express + PostgreSQL (pg)。1つのサーバーが配信中5アプリ（廃止済みのリアルタイムCGを除く）の静的ファイルを配信する**単一イメージ構成**
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
| **2026年10月の事業再編（社名変更・計上会社の2社化・GLS→GJV/GSS/GMO の改番）の移行設計** | [docs/reorg-2026-10-plan.md](docs/reorg-2026-10-plan.md) — 設計下書き。分岐点（§9）が決まるまで実装しない |
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
v4.6.3 — **受付レールで「失注にする」を押すと画面が飛んでしまい、次々に見送れなかったのを直した。あわせて、案件になりえないメール（社内周知・設備連絡など）が案件受付レールに混ざる問題も直した**。①案件作成画面（受付を統合した画面）で自動で届いた引き合いを「失注にする」（見送る）と、押すたびに `/sales/dashboard` へ強制的に遷移していた（`useCreateProject.ts` の `drop` ミューテーション）。複数件を続けて見送る作業のたびに画面が飛び、都度レールへ戻る手間になっていた。押したあとは画面を移動せず、選択を外す（`?inquiry=` も付いていれば URL から外す）だけにし、レールの続きをそのまま選べるようにした。②「そもそも関係のないメールが投入される」というご指摘を受けて本番の `misc_inquiries` 実データ（16件）を確認したところ、中身自体は取材依頼・資料DLリード・社内周知・設備連絡・協業打診など実在の業務メールで、いわゆる迷惑メール・メルマガの混入は見当たらなかった。一方で、これらは全16件とも「見送り」で終わっており、原因は `GET /dashboard/inbox` が `misc_inquiries` の未仕分け全件をタグで絞らずそのまま案件受付レール（`IntakeRail.tsx`）へ渡していたこと — 決定表（`.claude/skills/mail-intake/`）自身が「案件にしない」と明言しているタグ（社内周知・設備・工事・協業・取材・メディア掲載・セキュリティ・採用・先の話・他スタジオ）まで、「ネタのまま残す／失注にする／案件にする」の3択を迫っていた。`dashboard.routes.ts` の `INQUIRY_BASE` にこれらのタグを除外する条件を追加し、案件受付のレールは案件化の芽があるものだけに絞った。除外したものは「入ってきた情報」一覧（`/daily/inquiries`。別の口 `GET /dailyops/inquiries*` を読むため無影響）には今までどおり残り、見送り・ストック・チケット化ができる。検証: `npx tsc -b client server`・`npx eslint` とも該当ファイルはエラーなし。検証用DB（`npm run verify:up`）に社内周知／設備／リード／タグ無しの4件を投入し、除外条件つきSQLを直接実行してリード・タグ無しの2件だけが残ることを確認した。③さらに「メールの種類に応じて適切な行き先に振り分けるべき」というご指摘を受け、`.claude/skills/ai-feedback-loop/` で監査したうえで対応した。AI が直接スタジオ予約（`create_studio_booking`）を作る案は、記録・修正差分・成果紐づけ・還流・レビューの5条件が軒並み未整備（会社方針「AIを使い捨てにしない」に抵触）で、かつ二重予約・部屋の競合という実害を伴うため見送り、フェーズ1（タグ強化＋画面誘導）だけを実装した。決定表（`.claude/skills/mail-intake/`）に、日程・場所が具体的でスタジオの予定表に登録すべきと読めるメール（現地調査・入室予定・搬入出予定など）へ `予定候補` タグを追加で付けるルールを足した（予約はAIが作らない）。「入ってきた情報」一覧（PC・スマホとも）は `予定候補` タグを色付きで目立たせ、「次のアクション」ボタンも「タスクにする」ではなく「カレンダーに登録する」を既定で強調するようにした（`state.ts` の `primaryActionFor`）。検証: `npx tsc -b client-daily`・`npx eslint`・`npm run lint`（全体）・`npm run test`（shared Vitest 2240件）すべて通過。

v4.6.2 — ウィークリー活動報告（`/daily/weekly`）をモックから再設計し、対象週の追加・削除を作った。**構成を「生成工程の順」から「読み手の順」へ。** 自動集計 → AI の要約 → 週次トピックスという並びは AI が作る順序であって読む人の順序ではなく、見出しにも AI が2回出て画面の主語が中身ではなく生成元になっていた。**総括 → 主要指標 → トピックス → 詳細内訳** に組み替え、見出しは「総括」、AI の関与は本文下の署名（AI下書き／確定者名）に集約した。詳細内訳（パイプライン・営業活動の内訳・イベント・翌週予定）は既定で畳み、下書きのときだけ開く。状態表示は3種（下書き／未確認／AI作成）の並列をやめ、下書き／確定済みの1系統にした。**画面の主役を対象週にした。** 見出しが対象週そのもので、前後移動（◀ ▶）と 今週／先週 の表示を添える。左の週レール（`WeekRail`/`WeekPickerSheet`）は廃止し、一覧・追加・削除はシートに入れた。**週の追加は月次カレンダーから週行を選ぶ**（日付入力欄の直置きをやめた。作成済みの週がその場で分かるので重複作成にならない）。**削除**（`DELETE /dailyops/reports/:id`・`ops_reports.deleted_at` への論理削除）を新設し、下書きの週にだけ出す（確定済みは`assertReportOpen` が断る）。あわせて、**主要指標に前週比**を足し（`payload.stats.prev_week` に確定時点の比較値を同梱）、**下書きでスナップショットが無い週は集計を引き直す**ようにした（`GET /dailyops/weekly-stats`。以前は「集計はまだありません」の空欄で、総括を書く人が材料を見られなかった）。確定済みの週に書こうとしたときの断り文が実在しないボタン名（「確定を解く」）を案内していたので、画面のボタン名（「確定を取り消す」）に直した。設計の正は [docs/design/v4/mockups/weekly-redesign/](docs/design/v4/mockups/weekly-redesign/)（PC 閲覧・PC 作成・対象週の管理・スマートフォン・現行画面の5枚）。 **財務ダッシュボードのグループ内外表示・ステータス短縮、明細ページの列ソート、見積書コードの不一致を直した**。①財務ダッシュボードで絞り込んでいる状態のまま「グループ内案件」「グループ外案件」の売上・仕入（変動原価まで）が分かるようにしてほしいというご要望に応え、`monthly-summary.service.ts` に案件の `customer_type` 別の内訳（`revenue_internal`/`revenue_external`/`purchase_internal`/`purchase_external`）を足し、ダッシュボードに新しいカード（`GroupSplit.tsx`）を追加した。総額／確度加味どちらのモードでも効く（固定原価は特定のお客様に紐づかないため対象外）。②仕入・販管費の申請ステータスの文言（「金額はまだ仮」「金額確定・精算まだ」「金額確定・精算申請済」）が台帳の状態列（96px固定）に収まらず見切れていた不具合を、以前の短い文言「仮」「確定：未申請」「確定：申請済」に戻した（`ledger/settlementState.ts` 1本に集約。狭い列向けに別途縮めていた `compactSettlementLabel` は不要になったため削除）。③売上・仕入・販管費の明細ページで、列見出しをクリックして昇順・降順に並び替えられるようにした。サーバー側の並べ替え（`list-query.ts` の `build{Revenue,Purchase,Sga}Order`）は既に実装済みだったが3画面ともクエリに渡していなかっただけで、案件一覧と同じ表頭クリックの作法（`ledger/sort.ts`・`LedgerRows.tsx` の `HeaderLabel`）を配線した。Excel書き出しも画面の並び順のまま出るようにした。④見積書で自動採番される「見積書コード」（例 `GLS-A018-v3`）と、検収書PDFに表示される「見積書コード」が別ロジック（案件の売上連番＋税区分）で組み立てられ食い違っていた不具合を直した。検収書PDF生成時に、受注承認されてこの売上に変換された元見積（`estimates.revenue_id`。書き直しで複数版が同じ売上を指すことがあるため最新版を採る）から見積書PDFと同じ組み立て（GLS番号＋版）でコードを作り、`pdf.service.ts` にそちらを優先させた（見積を経ずに直接登録した売上は従来どおり請求KEYへフォールバック）。検証: `server`/`client` の型チェック・`npm run lint` はいずれも通過。4件とも検証用DBに実データを投入し、SQLクエリの実行結果・実APIレスポンス（ソート順）・生成したPDFのテキスト抽出（見積書コードの一致）で期待どおりの挙動を確認した。自動テストは追加していない（既存のVitestスイートに該当領域のテストが無く、今回も実データでの検証のみ）。

v4.6.1 — **PR #615（隔週キープ資料の②③・案件ページのデザイン刷新）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。マージすると Codex の指摘は GitHub の画面から消えるため、書かなければ存在ごと消える。#615 でCodexが指摘した13件（P1×5・P2×8。`carryOver`の対応付け・数字カード/チェック箇条書き/総括カードのはみ出し・内覧会の分類数の水増しなど）は、マージ前にすべてこの場で修正・返信・スレッド解決まで完了させていた。⚠️ **回帰テストを追加したのは`carryOver`の対応付け・生成id衝突まわりの3件だけ**（`shared/tests/keepReportDeckBuild.test.ts`）で、残り10件（長文・多件数の切り詰め・金額の縮小・内覧会の分類数・凍結パックのフォールバック・画面プレビュー側）は自動テストが無く、実データでのpptx出力＋XML実測のみ。この文書には「何が指摘され・どう直したか・検証方法（テストの有無を含む）」を追記した。 **PR #618（v4.6.0 リリース）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。Codex から届いた P2 指摘1件（62件集約で81,536文字になった「現在のバージョン」を `VersionHistoryModal` が常に既定展開していたため、開くと画面が全文で埋まる）はマージ前に `VersionHistoryModal.tsx` を直し、返信・スレッド解決まで完了させた（表に移す指摘なし）。⚠️ 最初に出した #617 は枝名が `release/` で始まっておらず `check-changelog.mjs` に引っかかり CI 赤・クローズ（`release/4.6.0` 枝で #618 に出し直した）。 **検収書PDFの日付を発行日にし、トップページ「日常業務」フライアウトの漏れを直した**。①案件管理から検収書としてPDFを発行すると、右上の日付が過去の日付（請求日・計上日）になっていた。検収書は「発行した日」を表す書類なのに、見積書・請求書と共通の日付算出ロジック（請求日→計上日→今日、の優先順）をそのまま使っていたため。`pdf.service.ts` で検収書のときだけ常に発行時点の日付を出すようにした。②トップページの「日常業務」タイルにマウスを合わせたときのフライアウトメニューに、新設済みの「フィードバックチケット」「タスク・依頼」が出ていなかった（`AppTiles.tsx` のハードコード配列に新機能追加時の追記が漏れていた）。左メニュー（`client-daily/src/components/layout/nav.ts`）と揃うよう2項目を追加した。③財務ダッシュボードの「総額／確度加味」切り替えを、営業見通し（パイプライン）カードだけに効く設定から、絞り込み状態も含めた**画面全体**の見方の切り替えに作り直した。確度加味のとき、サーバー（`monthly-summary.service.ts`）が売上・仕入（変動原価）を計上先の案件のいまのフェーズの受注確度（%）で重みづけて合算し直し（固定原価・販管費は対象外）、内訳の売上・仕入の各行にも同じ確度を掛けて表示するようにした（あくまでシミュレーション表示で、`revenues`/`purchases` の実額は変えない）。役目が画面全体に吸収されたため、営業見通し（パイプライン）カードと専用API（`GET /pipeline-forecast`）・専用集計（`pipeline-forecast.service.ts`）は削除した。検証: 新規マイグレーションなし。`server`/`client` の型チェック・`npm run lint`・`shared` のVitest 2240件、すべて通過。確度加味の重みづけ計算は検証用DBに実データ（確度50%のフェーズの案件に売上¥1,000・仕入¥200を計上）を投入し、総額と確度加味の両方（全体集計・案件絞り込みの両分岐）で期待値（¥500・¥100）と一致することを確認済み。④フィードバックチケット（GMO ONAiR 自体への要望・不具合報告）をチャットから起票できるMCPツール `create_feedback_ticket`（一覧確認用に `list_feedback_tickets` も）を新設した。起票は ONAiR ログイン連携（OAuth actor）専用（`reporter_id` が `users` への FK のため、共用APIキーの名義では起票できない・そもそも代理起票を避ける設計）。AIを使い捨てにしない5条件は、条件1（記録・`ai_outputs` に全文保存）は満たすが、条件2（人間の修正差分）はチケットの題名・内容を起票後に直す手段がまだ無く✕、条件3・4（成果・還流）は`get_ai_feedback_digest` が未対応で△、条件5（レビュー運用）は未定で✕（詳細は `feedback-tickets.tools.ts` 冒頭コメント）。今回は起票の口を作るところまでで、穴は明示のうえ次回以降の課題として残す。 **ウィークリー活動報告に「次の週を作る」ボタンを追加した**。ウィークリー活動報告（`/daily/weekly`）は AI の自動下書きが前提の設計だが、週の箱（レコード）を新しく作る自動生成トリガーは未実装のまま残っており、手動で作る入口も画面のどこにも無かった。API (`POST /dailyops/reports/ensure`) と `useEnsureReport`（`client-daily/src/lib/reportsApi.ts`）自体は既に用意されていたため、検証環境では週の箱が増えないまま止まっていた（7月の週が最新のまま止まっていた）。週のリスト（PC は `WeekRail`・スマホは `WeekPickerSheet`）の上に「次の週を作る」ボタンを追加した。押すと、一覧の先頭（サーバーが `period_key` の新しい順で返すので最新週）の翌週の開始日を計算し、`POST /dailyops/reports/ensure` を呼んで箱を作成、できた週へ遷移する。箱を作るだけの操作で既存の「先週ぶんを作成」相当のボタンにも確認ダイアログが無いため、こちらにも確認ダイアログは付けていない。ボタンは編集権限がある人（`canEdit`）にだけ出し、閲覧のみの人には出さない。`WeekRail`/`WeekPickerSheet` 側の実装は別作業（`onAddNextWeek?: () => void` /`addingNextWeek?: boolean` の2 props を追加）。呼び出し側の `WeeklyDetailPage.tsx` で`useEnsureReport()` を使い、翌週の開始日を求める `nextWeekStart()` をこのファイル内に閉じて実装した（`lib/types.ts` の共通ヘルパーには足していない — 過去に同種のヘルパーを呼び手0件で削除した経緯があるため）。検証: `npx tsc -b client-daily`、`npx eslint client-daily/src/pages/WeeklyDetailPage.tsx` ともエラーなし。`WeeklyDetailPage.tsx` は398行で1ファイル400行の上限内。 「入ってきた情報」に、タスク・案件と並ぶ4つ目の行き先「カレンダーに登録する」を追加した。メール等で届いた用件（例: 現地調査の日程共有）を、タスクや案件を作らずスタジオ予約として1件登録できる。押すとタイトル・日付・時刻（終日も可）・場所メモ・メモの最小限のダイアログが開き、`studio_bookings` に1件作る（`misc_inquiries.state='booked'`・押し直しても増えない。`ticket`/`project`と同じ設計）。部屋の選択や細かい調整はここでは行わず、予定表アプリ側で直す運用。 **PR #620（ウィークリー活動報告に「次の週を作る」ボタンを追加）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。Codexレビューで届いたP2指摘1件（スマホの週ピッカーが「次の週を作る」を押しても閉じずに新しい週の中身を隠す）はマージ前にその場で修正・返信・スレッド解決まで完了させ、[docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) に記録した（表に移す未対応の指摘なし）。 PR #621（「入ってきた情報」に「カレンダーに登録する」を追加）のレビュー棚卸しを記録した。Codexのコードレビュー・セキュリティレビューが計4件（P1×2・P2×2）指摘し、全件この場で対応・返信・スレッド解決まで完了させてからマージした（未対応で残った指摘は無い）。 PR #624（PR #621のレビュー棚卸し記録）に付いたCodex指摘1件を反映した。「直さないと決めたもの」（dailyops:editorだけでスタジオ予約を作れる権限設計）を番号付きリストの文章にしか書いておらず、`npm run reviews:debt`の数え方（表の行のみを数える）から漏れる状態だったため、正式な表の行として記録し直した。 **PR #622（検収書PDFの日付・財務ダッシュボード確度加味拡張・フィードバックチケットMCP追加）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。⚠️ **作成からCI greenまで約4分、その直後にマージされ、`get_reviews`・`get_review_comments` とも0件**。Codexのレビュー要約コメントはマージ時点で「Running」のまま（Code Review・Security Review とも完走しなかった）——**レビューが実質0件のままマージされた**。表に移す指摘はなし（レビュー自体が届いていないため）。詳細は[docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md)。


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
