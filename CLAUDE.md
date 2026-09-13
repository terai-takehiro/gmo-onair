# GMO ONAiR - プロジェクトメモリ

この文書は Claude が毎ターン読む。**全体に効く決めごとだけ**を置く。
アプリ固有のことは各ディレクトリの `CLAUDE.md`、手順の詳細は `docs/`（目次は [docs/README.md](docs/README.md)）に置く。
同じことを2か所に書かない（必ず片方が古くなる）。

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの制作管理プラットフォーム（会社OS）の総称。
複数の「ブロックアプリ」を1つのモノレポ・1つのサーバーで束ねる。特定の機能を指す名称ではない。
案件の**管理番号**（内部名 GLS番号。DB 列や発番操作の名前は `gls` のまま）を中核に全アプリのデータが紐づく。

### ブロックアプリ一覧

| アプリ | ディレクトリ | ベースパス | ポート | 状態 | 概要 |
|---|---|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定・プロジェクト管理 | [`client/`](client/CLAUDE.md) | `/` | 5173 | v4 対象 | 案件・見積・売上・仕入・損益・予定・権限。プロジェクト管理（GLS-B）は `/gpm` |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 5180 | v4 対象 | 週報・ニュース・内覧会・受領書類・セキュリティカード・タスク |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 5175 | v4 対象 | 機材台帳・ラック図・貸出・棚卸し・メンテナンス |
| 制作技術支援（中に Qシート） | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧 `/qsheet/` は転送で生存） | 5174 | **凍結解除中** | 台本作成・本番進行（進行／ランダウン／プロンプター／音声サポート）・計時・視聴者・テロップCG・レンタル機材検索。`permissionModule`・DB・サーバーの contexts は `qsheet` のまま |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 5178 | v4 対象 | 制作技術支援のミニアプリ。アプリ一覧には出ない。**表示画面 `/live/display/` だけは見た目を変えない例外** |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（到達不可） | — | **廃止** | 2026-09-06 に廃止。後継は制作技術支援＞テロップCG（`client-techops/src/pages/graphics/`）。コードは参照用に残すだけで、配信・API・ビルド対象から外してある |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | — | v4 対象 | トークン・UI 部品・共通シェル。**触ると全アプリに効く** |

- アプリ登録（名前・入口・権限モジュール・廃止の印）の唯一の正は `shared/src/client/apps.ts`
- 「凍結」「凍結解除中」「廃止」の定義は [docs/v4-plan.md](docs/v4-plan.md) の「用語」
- 外部リンク（別 VPS・別タブ）: インタラクティブ https://interactive.gmo-onair.jp/ ／ 翻訳 https://gmo-translate.jp/

## Claude の応答言語ポリシー
- 作業中（ツール呼び出しの説明・思考過程）は英語で処理してよい
- **チャットでユーザーに返す最後の返信は、必ず簡潔な日本語**（処理の垂れ流しではなく、結論・状態・次のアクションが分かる短い要約）

## 技術構成
- **フロントエンド**: React 18 + Vite 6 + TypeScript + TailwindCSS 3 + shadcn/ui
- **バックエンド**: Express + PostgreSQL 16（`pg`）。**1つのサーバーが配信中5アプリの静的ファイルを配信する単一イメージ構成**
- **モノレポ**: npm workspaces（client, client-daily, client-equipment, client-techops, client-live, client-awards, server, shared）
- **リアルタイム**: Socket.IO（`/techops` 名前空間で OnAir↔ランダウン同期。旧 `/qsheet` はブリッジで生存。ほか graphics / quiz / liveops）
- **デプロイ先**: CoNoHa VPS（Docker Compose + PostgreSQL + Nginx）。本番と検証を同じ VPS で並走

### よく使うコマンド
```bash
npm run verify:up      # 検証用 Postgres を立てる（約4秒・ポート5433・本番とは完全分離）
npm run dev            # 既定3アプリ + server（全アプリは dev:all）
npm run typecheck      # 既定3アプリ + server（CI は typecheck:all = 廃止アプリを除く全ワークスペース）
npm run lint           # eslint ＋ 各種検査（changelog / トークン / リンク / migration 番号 ほか）
npm run test           # shared の Vitest ＋ server のレビュー試験（CI が回す。手元の gate にも必ず入れる）
npm run build:changed  # 変更したワークスペースだけビルド（全部だと約2分）
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
npm run check:version  # バージョン表記の整合（3か所）
```
`build` / `typecheck` / `dev` の既定が3アプリなのは**手元の速さのため**。本番は Dockerfile が廃止アプリを除く全アプリをビルドする。

### どこに何が書いてあるか
| 知りたいこと | 読む場所 |
| --- | --- |
| **docs/ 全体の目次** | [docs/README.md](docs/README.md) |
| 環境構築から PR まで | [CONTRIBUTING.md](CONTRIBUTING.md) |
| ブランチ・PR・リリース手順 | [docs/branching.md](docs/branching.md) |
| デプロイの仕組み（GHCR・キャッシュ・戻し方） | [docs/deploy-pipeline.md](docs/deploy-pipeline.md) |
| VPS の構成・運用・DB バックアップ | [docs/ops/vps-setup.md](docs/ops/vps-setup.md)・[docs/ops/db-backup-restore.md](docs/ops/db-backup-restore.md) |
| v4 の開発計画・スコープ・用語 | [docs/v4-plan.md](docs/v4-plan.md) |
| **v4 でどこまで出来たか（サイトツリー）** | [docs/v4-progress.md](docs/v4-progress.md) — `node scripts/v4-progress.mjs --write` の**生成物**。v4 の PR では毎回作り直して本文に貼る |
| 全画面をネイティブ級にする計画（2026-08〜） | [docs/v4-native-ui-plan.md](docs/v4-native-ui-plan.md) |
| **2026年10月の事業再編**（社名変更・計上会社の2社化・GLS→SCS/GSS/GMO の改番） | [docs/reorg-2026-10-plan.md](docs/reorg-2026-10-plan.md) — 設計の正。冒頭の状態欄に「実装済み」と「判断待ち（§9）」の区別がある |
| v4 の画面ごとの仕様（モックが正） | [docs/design/v4/README.md](docs/design/v4/README.md) |
| 用語の決めごと（画面に出す言葉） | [docs/wording.md](docs/wording.md) |
| どの仕事にどのモデルを使うか | [docs/ai-models.md](docs/ai-models.md) — 段は light / heavy の2つだけ。基準は「間違いに気づけるか」で費用ではない |
| MCP のツール一覧 | [docs/mcp-server.md](docs/mcp-server.md) |
| レビューの台帳・計画・記録 | [docs/reviews/README.md](docs/reviews/README.md) |
| 版ごとの変更（過去全件） | [docs/version-history.md](docs/version-history.md) |
| エンジニアでない人向けの説明 | [docs/guide/README.md](docs/guide/README.md) |

## 現在のバージョン
v4.6.14 — **制作技術支援に「運営マニュアル」「会場図面」の2つのミニアプリを新設した**。①運営マニュアルは設計・モックアップから実装まで進め、マージ直後に届いたCodexレビュー指摘4件（P1×2・P2×2）を別PRで修正し、「体制図」ブロック（木構造の分岐・顔写真つき）を追加、利用者から報告のあった不具合3件も直した。②会場図面（会場図面シミュレーター）は設計・モックアップから実装（migration 298/299・サーバーAPI・運営マニュアルへの差し込み・PC編集盤／スマホ閲覧）まで進め、届いたCodexレビュー指摘8件（P1×6・P2×2）も同PR内で修正した（段F＝会場・階の管理画面は今回のスコープ外）。③PR #676・#677・#678・#679・#680・#681のレビュー状況を棚卸しに記録した（`docs/reviews/codex-findings-v4.md`。表に移す未対応の指摘は無い）。1件ずつの詳細は `docs/version-history.md` のこの版の全文を参照。

v4.6.13 — **PR #669のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#669（`feat(finance): 財務ダッシュボードの損益の流れとグループ内外カードを見直し`）はCode ReviewがCodexのusage limitsで一度も実行されず、Security Reviewは完走したがfindingsは無かった（`get_reviews`/`get_review_comments`ともに0件）。表に移す未対応の指摘は無いが、レビューが1件も届いていないため「指摘なし」と区別できるよう`docs/reviews/codex-findings-v4.md`「一覧（PR の新しい順）」に記録した。検証: `node scripts/check-md-links.mjs`。 **PR #670・#671のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#670（#669のレビュー棚卸し記録）はCode ReviewがCodexのusage limitsで実行されず、Security Reviewはマージ前に完走しfindingsは無かった。#671（`release: v4.6.12`）はCode Reviewが同じくusage limitsで実行されず、Security Reviewは「Running」のままマージされ、完了（findings無し）はマージの約34秒後だった——#667と同型の「走り切る前にマージされた」ケース。いずれも表に移す未対応の指摘は無いが、レビューが1件も届かないまま・または完走前にマージされたことを「指摘なし」と混同しないよう記録した。検証: `node scripts/check-md-links.mjs`。 **① 予定の週表で、札の上端でも延ばせて、掴んで動かせるようにした**。週表（`TimeGrid.tsx`）は下端のつまみを引く延長しか持たず、開始時刻をずらす・時間帯や曜日を動かすには「札を押す→詳細→編集→時刻を打ち直す」の4手が要った。①下端に加えて上端にもつまみを付け、開始時刻を延ばし縮めできるようにした（`useGridDrag.ts` の `resize` に `edge: 'start' | 'end'` を追加）。②札本体を掴んで動かすと、長さ（開始〜終了の間隔）を保ったまま時間・曜日をまとめてずらせるようにした（`move`。マウス位置の下にある列を `elementFromPoint` で拾い、日をまたぐ移動にも対応）。保存は3系統とも部分更新（動かした項目だけ送る）のまま、サーバー側の `isReversedTimeRange` チェックも従来どおり効く。ドラッグ操作か通常のクリック（詳細を開く）かは `wasDragged()` で区別し、動かした直後のクリックが誤って詳細を開かないようにした。検証: `npx tsc -b client`・`npm run lint`。**予約・予定の入力ダイアログ3つで、終了が開始より前でも保存できてしまう不具合を直し、日時のデフォルト値を足した**（`StudioBookingDialog.tsx`・`PersonalEventDialog.tsx`・`PartnerScheduleDialog.tsx`）。①終了日欄は `min` 属性しか持たず、`min` はカレンダー UI の選択しか止めない — 日付欄をキーボードで直接打ち直すと開始日より前の値でも通ってしまい、送信ボタンを押してもブラウザの標準検証に握りつぶされて **何も起きないように見える**不具合があった。終了日・終了時刻の `onChange` と送信前チェックの両方で開始との前後関係を見るようにした。②あわせて「複数日は開始日の翌日をデフォルトに」「終了時刻は開始時刻の1時間後に追従」というご要望に対応。複数日トグルを入れた瞬間・開始日を動かして終了日が開始日以前になった瞬間に終了日を翌日へ押し出し（スタジオ予約のみ。他の2画面は複数日トグルが無く、終了日欄が単日/複数日どちらの意味も兼ねる設計のため対象外）、終了時刻を手で直していない間は開始時刻を動かすと終了時刻が1時間後に追従するようにした（編集時・時刻付きプリセットは指定値を保つ）。日付・時刻の計算は `shared/src/client/format.ts` に `addDaysToDateStr`・`addMinutesToTimeStr` を足して3画面で共用。`StudioBookingDialog.tsx` は日時セクションを `BookingDateTimeSection.tsx` に切り出し（1ファイル400行のラチェット）。検証: `npx tsc -b client`・`npm run lint`・`npm run test`。 **PR #673のレビュー指摘のうち1件がマージに含まれていなかったのを取り込み、棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。①#673（カレンダーの日付入力・週表ドラッグの修正）はCodexから届いた指摘8件（P1×5・P2×3）を都度修正・返信・スレッド解決していたが、最後の8件目（22:00際の短い予定で上端つまみの視覚位置がずれ、開始時刻が最大20分ジャンプする不具合）の修正コミットがマージの約1分後にpushされたため、PRには取り込まれずマージされていた。レビュー対応中にPR作成者がマージ操作を行ったタイミングのすれ違いが原因。②取りこぼした修正（`useGridDrag.ts` の resize に `grabOffsetMin` を足し、掴んだ位置と論理時刻のずれを補正する）を本PRに取り込み、main に反映した。③#673のレビュー状況（全8件の内容・対応経緯・取りこぼしの顛末）を`docs/reviews/codex-findings-v4.md`の一覧に記録した（表に移す未対応の指摘は無い＝全件修正済み）。検証: `npx tsc -b client`・`npm run lint`・`npm run test`・`node scripts/check-md-links.mjs`。

v4.6.12 — **PR #665のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#665（ドキュメント全体の体系的な書き直し）は、作成10秒後にCodexがusage limitsを返しCode Reviewが1巡も走らず、Security Reviewも「Running」の要約が1回出たきり完了しないままマージされた。`get_reviews`/`get_review_comments`で0件を確認し、`docs/reviews/codex-findings-v4.md`の「レビューが0件のままマージされたPR」に記録した（表に移す未対応の指摘は無い＝レビュー自体が届いていないため）。検証: `node scripts/check-md-links.mjs`。 **PR #667のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#667（`release: v4.6.11`）はCode ReviewがCodexのusage limitsで作成6秒後に不能、Security Reviewも「Running」のまま完走せずマージ（CI green から約1分24秒後）された。`get_comments`で要約コメントが`running`のまま更新されていないことを確認し、`docs/reviews/codex-findings-v4.md`「レビューが0件のままマージされた PR」に記録した。あわせて、#665が次のリリースPRでの目視確認を求めていた`npm run release:notes`のREADME.md書き込み（版差し替えが1行になっているか）を実地で確認し、問題ないことを確認した。検証: `node scripts/check-md-links.mjs`。 **財務ダッシュボードの損益の流れとグループ内外カードの表示を見直した**。①損益の流れ（`/budget/dashboard`）は、見出し（大きいカード）が限界利益／売上総利益／営業利益、材料（下の小さい行）が売上／仕入（変動原価）／固定原価／販管費という並びだった。「見出しは売上／仕入（変動原価）／粗利／営業利益、材料は固定原価／販管費にしてほしい」というご要望に応え、見出しを4枚（売上・仕入（変動原価）・粗利〈旧・売上総利益〉・営業利益）、材料を2行（固定原価・販管費）に組み替えた。限界利益は途中の値のためどちらにも出さない（案件で絞り込み中の3枚だけの表示は変更なし）。②「グループ内／グループ外」カードは売上・仕入しか出しておらず、絞り込み状態での粗利がグループ内外で分からなかった。ご要望に応え、各カードに粗利（売上－仕入。固定原価は特定のお客様に紐づかないため対象外＝限界利益と同じ式）を追加した。値はサーバー（`monthly-summary.service.ts`）が出したものをそのまま表示し、画面側では計算し直さない。検証: `npx tsc -b client`・`npx tsc -b server`・`npm run lint`・`npm test`。

> **それより前の版（全件・全文）は [docs/version-history.md](docs/version-history.md)。** 画面の「バージョン履歴」は
> この節とアーカイブの両方から `scripts/generate-version-history.mjs` が作る（同じ版は長いほうの本文を採る）。
>
> **この節に残すのは最新3件・1件＝見出し＋2〜3文まで。** リリース時に `npm run release:notes` が
> 新しい版を先頭に積み、4件目をアーカイブへ落とす。全文を残したい版はアーカイブ側に全文を置く。
> この節は毎ターン文脈に載るため、貯めると全作業のコストが上がる。

## 開発の絶対原則: AIを使い捨てにしない (必須チェック)

会社方針。**AI 機能を作る・変えるときは必ず**フィードバックループを設計に組み込む。
AI を一度使って終わりにすると人間の修正コストが永久に減らず、直した労力が資産にならない。

**回すループ**: ①AIが業務を実行 → ②4つのフィードバックを回収（業務結果 / 人間の修正差分 / 顧客反応 / 成果指標）→ ③AI改善に反映（プロンプト・ナレッジ・学習データ）→ ①に戻す

**設計時に必ず満たす5条件**: 1) AI出力を記録・保存 2) 人間の修正を差分として残す 3) 顧客反応と成果指標を出力に紐づける 4) 貯めたデータをAI改善に戻す経路 5) レビュー頻度と担当を決める

**運用**: AI/MCP/スキル/自動化の設計・変更時は `.claude/skills/ai-feedback-loop/` のスキルを使い、
5条件の充足表を出して**抜けを明示**する。経路が作れない要素は「できない」で止めず必ず代替案を添える。
ONAiR の現状（何が既にあり、どこが穴か）は同スキルの `references/onair-current-state.md` に集約済み。
AI が関与しない UI 修正・CRUD・デプロイ作業には適用しない。

## ブランチ運用とリリース

**正は [docs/branching.md](docs/branching.md)。** ここには要点だけ置く。

- **長く残るブランチは `main` だけ。** 直接 push 禁止（PR のみ・Squash マージ固定）
- **`main` は本番ではない。** `main` にマージ = **検証環境**（dev.gmo-onair.jp）に自動デプロイ
- **本番に出るのは GitHub で Release（タグ `vX.Y.Z`）を公開したときだけ。** ユーザーの明示的な指示なしに公開しない
- 作業ブランチは `feature/<Issue番号>-<短い名前>`（`fix/` `chore/` `docs/`）。Claude Code Web の `claude/*` もそのまま PR にしてよい。数日で PR にして消す
- ブランチ単位で検証環境に出したいときは Actions → Preview → ref を入力（本番には出せない）
- **PR タイトルは `種類(アプリ): 何をしたか`**（例 `feat(equipment): 機材台帳を v4 の見た目にした`）。Squash マージで `main` の1コミットになり、`git log --oneline` が機能の一覧になる
- ⚠️ **Claude が PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` を使って見張る（マスト）。**「見張りますか」と訊いて返事を待つのも不可 — その間 CI 失敗もレビューも誰も見ない
- ⚠️ **マージしたら、その PR のレビュー指摘を棚卸しに移す**（`npm run reviews:debt` → [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md)）。マージすると指摘は画面から消えるので、書かなければ存在ごと消える。**直さないと決めたものも表から消さない**

### バージョンと履歴

- **作業 PR では版を触らない。** 代わりに `docs/changelog.d/<枝の名前>.md` に載せたい文を1つ置く（`npm run lint` の `check-changelog.mjs` が両方を強制する。書き方は [docs/changelog.d/README.md](docs/changelog.d/README.md)）
- **リリース時**に `npm run release:notes -- X.Y.Z` が、ルート `package.json` の `version`・この文書の「現在のバージョン」（先頭に積み、4件目をアーカイブへ）・`README.md`（番号と見出しだけ）を更新する。整合は `npm run check:version`。各ワークスペースの `package.json` は触らない（Docker のビルドキャッシュが無効化される）
- 画面の「バージョン履歴」は `scripts/generate-version-history.mjs` が**この文書（最新3件）＋ [docs/version-history.md](docs/version-history.md)（それ以前の全件）**から生成する。**書式を崩すとパースに失敗する**（この文書は `vX.Y.Z — **タイトル**。本文` の1行・アーカイブ側は全体を `(...)` で包んだ1行）

## 環境分離ポリシー (最重要)

### 本番環境と検証環境は絶対に干渉させない
- **本番**: `https://gmo-onair.jp` — コンテナ `app_prod`・DB `onair_prod`・認証 Email/Password + SMS 2FA・`SKIP_SEED=true`（シードなし・マスター管理者のみ自動作成）
- **検証**: `https://dev.gmo-onair.jp` — コンテナ `app_dev`・DB `onair_dev`・認証は本番と同じ Email/Password（`AUTH_MODE=password`）・シードデータあり・自由に壊せる
- **手元の開発**（`npm run dev`）: 認証の既定は mock（ユーザーカード選択式）。`npm run verify:up` の検証用 Postgres はポート 5433 で、本番・検証のどちらとも別

### 絶対厳守
- 本番DBと検証DBは**完全分離**。相互参照・相互コピー禁止
- 本番DBに対する直接SQL操作は**最小限**（管理者パスワードリセット等の緊急時のみ）
- 検証環境のデータが本番に流れ込まないこと。本番の秘密情報（JWT_SECRET 等）を検証環境で使わないこと
- **本番へ出す（GitHub Release の公開）は、ユーザーの明示的な指示があるときだけ。** Claude が自分の判断で公開しない。`main` への直接 push も禁止（PR のみ）

デプロイの流れ: PR を `main` にマージ → 検証環境に自動デプロイ。本番はユーザーが Release を公開したときだけ。
手順・戻し方は [docs/branching.md](docs/branching.md) と [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。

### バージョン確認コマンド (VPS)
```bash
cd /root/gmo-onair && git log --oneline -1                    # 現在のコード
curl -sk https://dev.gmo-onair.jp/health                       # 検証稼働確認
curl -sk https://gmo-onair.jp/health                            # 本番稼働確認
```

### DB バックアップ・復元運用
3時間ごとの自動バックアップ（BOX 保存）と復元 CLI がある。手順は [docs/ops/db-backup-restore.md](docs/ops/db-backup-restore.md)。
**DB を伴う変更（migration 200・206〜208 以降）はコードだけ戻しても動かない** — [docs/deploy-pipeline.md](docs/deploy-pipeline.md) の「戻し方」。

## UI/UX ポリシー

### モックが v4 の正
`docs/design/v4/mockups/` のモックが v4 の正（[docs/v4-plan.md](docs/v4-plan.md) の「大前提」）。実装・過去の決めごと・用語ルールがモックと食い違ったらモックに合わせる。
止めてよいのは「実害が出る」4種類だけ（同文書）。守る規律（縦の整列・金額表記・型スケール・角丸の役割名）は
[docs/design/v4/_rules.md](docs/design/v4/_rules.md)、部品の一覧は [CONTRIBUTING.md](CONTRIBUTING.md) の「守るもの」。

### レスポンシブデザイン必須
- **全ての画面はスマホ対応を前提**で設計・実装する（モバイルファースト）。375px 幅（iPhone SE 相当）でも破綻しないこと
- Tailwind のブレイクポイント `sm:` `md:` `lg:` を使う／横スクロールしうるテーブルは `overflow-x-auto`／フォームは1カラム縦積みが基本／タップ領域は最低 44px／ダイアログは `max-h-[90vh] overflow-y-auto`／固定ヘッダー・フッターは `safe-area-inset` を考慮
- 実装後は `npm run verify:ui`（実ブラウザ・1440px と 375px）で確認する。PC 専用にする画面は `client/src/pcOnlyScreens.ts` に理由つきで宣言する（`check-mobile-declared.mjs` が見る）
- 既存画面もレスポンシブ不備を見つけたら随時修正する

## コード健全性ポリシー

依存関係のバージョン整合・ビルド設定の同期・Lint 基盤・TODO 管理・定期セルフレビューの方針は
[docs/archive/2026/2026-04-28-code-health.md](docs/archive/2026/2026-04-28-code-health.md)（2026-04-28 の codex フルレビューからの学び）。
機械で止めているもの（1ファイル 400 行・shared の参照経路・UI トークン・migration 番号の重複・文書のリンク切れ）は `npm run lint` に入っている。

## デプロイ先の構成

手順は [docs/branching.md](docs/branching.md)、仕組みの中身は [docs/deploy-pipeline.md](docs/deploy-pipeline.md)、VPS の運用は [docs/ops/vps-setup.md](docs/ops/vps-setup.md)。

- **VPS**: CoNoHa VPS — Docker Compose（プロジェクト名 `gmo-onair`）で本番 `app_prod:3000` と検証 `app_dev:3001` を並走。nginx・PostgreSQL・レンタル機材スクレイパー2本も同じ compose
- **VPS のリポジトリ**: `/root/gmo-onair`（本番）・`/root/gmo-onair-dev`（検証の worktree）
- **DB**: 単一 PostgreSQL を DB 名で分離（`onair_prod` / `onair_dev`）
- **イメージ**: `ghcr.io/terai-takehiro/gmo-onair` の `:prod` / `:dev` / `:sha-<SHA>` / `:vX.Y.Z`。ビルドは GitHub Actions、VPS は pull するだけ

## セキュリティポリシー

### 絶対にやってはいけないこと
- `.env` や認証情報を Git にコミットしない（`.gitignore` 済み）
- API キー・パスワード・JWT シークレットをソースコードにハードコードしない
- 本番 DB の接続情報を開発環境のコードやログに出力しない
- `JWT_SECRET` にデフォルト値を本番で使わない

### 認証
- **切替は `AUTH_MODE` 環境変数**（`server/src/config.ts`）: `password` = Email/Password + SMS 2FA ／ `mock` = ユーザーカード選択式。本番（`NODE_ENV=production`）は常に `password`、検証環境（`app_dev`）も `password` を明示、手元の開発の既定だけ `mock`
- JWT: HTTP-only cookie + Authorization Bearer ヘッダーの二重送信
- Google の資格情報（`GOOGLE_CLIENT_ID` 等）は**カレンダー連携専用**。ログインには使わない

### 環境変数の管理
- `.env.example` をテンプレートとして使用（`cp .env.example .env`）。本番の `JWT_SECRET` は `openssl rand -hex 32` で生成、`DB_PASSWORD` は十分な長さのランダム文字列
- Docker Compose は `.env` ファイルから自動読み込み

### 開発環境
- ローカル開発は `.devcontainer/`（Dev Containers）を使用して隔離。コンテナ内で `npm install` + `npm run dev` が完結する構成
- ホストマシンの認証情報や SSH キーはコンテナに渡さない

## BOXフォルダ構造
案件ごとの BOX フォルダの決めごとは [docs/architecture/box-folder-structure.md](docs/architecture/box-folder-structure.md)。
