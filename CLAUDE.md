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
v4.4.9 — **リアルタイムCG（凍結中）のデモ用ダミーデータに、画像部分へ入るダミーの顔写真を追加した**（ユーザー要望「運用の際に画像部分にダミーの顔写真を入れられるようにしたい」）。`server/src/shared/db/seed-awards.ts` が開発・検証環境に自動投入するデモの37エントリは、これまで `photo_url` が未設定で、CG画面では初期文字だけのグラデーションプレースホルダー（`PortraitPlaceholder.tsx`）しか映らず、実際の放送CGの見え方をデモしづらかった。実在の人物写真は権利・プライバシー上使えないため、髪型・肌色・背景色をコードで組み合わせたイラスト調のアバター（架空の人物）をSVGで16種類生成し、通常の写真アップロードと同じ配信経路（`UPLOAD_DIR` 直下 + `/api/v1/internal/awards/images/:filename`）に載せて全37エントリに使い回しで割り当てた。検証: `npm run typecheck --workspace=server`・`npm run lint`・`npm run test`（1465件）を確認済み。実サーバー（検証用Postgres、フレッシュな状態から）で `db:seed:awards` を実行し、全37エントリに `photo_url` が入ること・再実行時にスキップされる（冪等性）ことを確認。実サーバーを起動して `GET /api/v1/internal/awards/images/dummy-avatar-01.svg` が `200 image/svg+xml` で返ること、公開エンドポイント `GET /api/v1/internal/awards/events/1/output` の各エントリに `photo_url` が入っていることも確認済み。生成したアバター画像をブラウザで実際にレンダリングし、見た目を目視確認済み。 **PR #439（リアルタイムCGのデモ用ダミーデータにダミー顔写真を追加した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分6秒、CI green から約49秒（作成から約2分55秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため、GitHub MCP で直接確認した）。

v4.4.8 — **PR #437（内覧会 来場予約の MCP ツールに update_inview_attendee を追加した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約1分48秒、CI green から約3分29秒（作成から約5分17秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **PR #432（独自作成の番組の計時タイマー表示不具合を直した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約1分50秒、CI green から約1分37秒（作成から約3分27秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **内覧会 来場予約の MCP ツールに `update_inview_attendee`（更新）を追加した**（ユーザー要望「ONAiRの内覧会関連ツールは『新規登録』と『一覧参照』のみで、既存レコードを更新・編集するツールを追加」）。`register_inview_attendee`（新規登録・同 email × 同 session_label のみ暗黙更新）と `list_inview_attendees`（一覧）はあったが、任意の登録を id 指定で直接更新する道が無かった。内部で既に使われていた `inviewService.update`（部分更新・session_label 変更時の日付/時間帯/対象の再抽出・companions の氏名突き合わせによる受付記録の引き継ぎに対応済み）をそのまま呼ぶ形で MCP ツールを新設し、権限ゲート（`dailyops` editor 以上）にも登録した。検証: `npm run typecheck --workspace=server`・`node scripts/generate-mcp-tools.mjs`（権限ゲート検証OK・112種に更新）を確認済み。

v4.4.7 — **廃止したリアルタイムCG（client-awards）を「URLを叩けばアクセスできる」状態に戻した**（ユーザー要望「クローズしたリアルタイムCGですがURLを叩けばアクセスできるようにしてもらえますか」）。2026-08〜「廃止」（サーバー配信・API・Socket.IO・ビルド対象・トップページの入口をすべて外し、Webサイトのどこからも到達できない状態）にしていたが、`docs/v4-plan.md` の用語でいう一段手前の「凍結」（URLは生かすが、トップページのタイル・アプリ切替・左メニューには出さない）へ戻した。`client-awards/CLAUDE.md` の「復活させたいとき」に書かれていた手順のうち、`server/src/app.ts` の `serveApp('/awards', …)`・`server/src/routes/index.ts` の `createAwardsRoutes()`/`createQuizRoutes()`・`server/src/index.ts` の `initAwardsSocketIO()`/`initQuizSocketIO()`/`initInteractivePoller()`・`Dockerfile` の `build-client-awards` ステージと `production` への `COPY` の4点を戻した。`client/.../home/AppTiles.tsx` の `EVENT_KEYS` へ `awards` を戻す5点目だけは行わず、トップページのタイル・アプリ切替・左メニューには出さないままにした（コード自体も frozen:true のままのため、これらの画面には元々出ない）。ホームタイルにも出したい場合は別途対応が必要。**デモ用のダミーデータも投入した**（ユーザー要望「PRの前にデモンストレーションが可能な完全なダミーデータをある程度のボリュームで格納しておいてほしい」）。復活させても DB が空のままでは URL を開いても何も映らなかったため、他の `seed-*.ts` と同じ仕組みで `server/src/shared/db/seed-awards.ts` を新設し、開発・検証環境の起動時に自動投入されるようにした（本番は既存の仕組みどおり `SKIP_SEED=true` のため入らない）。イベント3件（開催中 `live`・終了済み `closed`・準備中 `draft` の3状態）・カテゴリ9本（直接選出 `direct` 7本・投票 `vote` 2本）・エントリ計37件、クイズ2問（正誤つき `quiz` モード1・投票のみ `survey` モード1、選択肢に投票数も投入）を用意した。開催中イベントは `awards_cue_state`・`awards_oneshot_cue_state` もあらかじめ「表示中」の状態まで進めてあるため、`/awards/*` を開いた瞬間から実際の画面が見える。検証: `client-awards`・`server` の型検査・ビルドに加え、実サーバー（検証用Postgres）を起動して `seed-awards.ts` の投入と再実行時のスキップ（冪等性）、`/awards/events`・`/events/:id`・`/events/:id/cg-status`・公開用 `/events/:id/output`（認証なし）が投入したダミーデータを正しく返すこと、`/awards/output/1` が200で返ることを確認済み。 **制作技術支援で案件に紐づけず「独自に番組作成」をすると、計時・視聴者（タイマー）のミニアプリが表示されなかった不具合を直した**（ユーザー指摘「独自に番組作成をした際に計時タイマーのアプリが表示されない」）。制作技術支援のトップ（`ProductionTopPage.tsx`）は「①案件管理の案件・番組を選ぶ」か「②案件管理に登録しない、ここだけの番組（`qsheet_programs`）を選ぶ」の2択だが、計時・視聴者が使う `liveops_programs.project_id` は `projects` テーブルだけを参照するFKで、②の番組に対応する列が無かった。そのため②で作った番組のハブ画面には計時・視聴者のタイル自体が出ず（`MiniAppTiles.tsx` が `scope === "project"` のときだけ表示）、直URLで開いても `useLiveProgram.ts` が `owner.kind !== 'project'` を検知して「案件からのみ開けます」と弾いていた（この制約は `12-live-timer-decision.md` に「既知の空白」として明記済みで、以前あった案件非依存のスタンドアロン新規作成という回避策もv4.1で意図的に廃止されていたため、②の番組から計時・視聴者に届く道が完全に無くなっていた）。`liveops_programs` に `qsheet_program_id`（`qsheet_programs` 参照・`project_id` とは同時に持たない CHECK。migration 237）を追加し、`POST /liveops/programs/resolve-by-program/:programId`（`resolve-by-project` と対になるエンドポイント）を新設。`useLiveProgram.ts` が owner の `kind`（`project`/`program`）に応じてどちらのエンドポイントを呼ぶか分岐するようにし、`MiniAppTiles.tsx` の計時・視聴者タイルもscopeを問わず出すようにした。あわせて、`project_id` が無いことだけを根拠に「案件に紐づかない旧スタンドアロン」と判定していた `LiveLegacyProgramsPage.tsx`（一覧の絞り込み）・`useLegacyProgramRedirect.ts`（旧URLの転送先判定）も、新しく `qsheet_program_id` が入っている行を誤って「紐づかない」扱いしないよう両方 NULL の行だけを対象にするよう修正した。検証: `npm run typecheck`・`npm run test` を確認済み（実サーバー・実DBでの動作確認はこのセッションから未実施）。 **PR #433（廃止したリアルタイムCGをURLアクセス可能に戻し、デモ用ダミーデータを投入した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分40秒、CI green から約38秒（作成から約3分18秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（GitHub MCP で直接確認した）。


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
