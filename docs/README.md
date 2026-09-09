# docs/ の目次 — どこに何があるか

約160ファイルあるが、**読む順番は決まっている**。迷ったらこのページに戻る。
計画・設計・レビューの各文書は冒頭に状態欄（**状態／最終確認／位置づけ**）を持つので、本文を読む前にそこを見る。

| 分類 | 何が入っているか | 扱い |
| --- | --- | --- |
| ① 現役の決めごと | 手順・ルール・契約。**これが正** | 実態が変わったらその場で直す |
| ② 計画・設計 | 進行中の計画と、判断待ちの設計 | 状態欄を更新する。判断待ちのまま実装しない |
| ③ 記録・台帳 | レビューの棚卸し・監査・経緯の記録 | 追記はするが、過去の記述は書き換えない |
| ④ だれでも読める説明書 | エンジニアでない人向け | 用語と現状を平易に保つ |
| ⑤ 生成物 | スクリプトが作るもの | **手で直さない** |
| ⑥ 作業場 | PR ごとの版の下書き | リリースで消える |
| ⑦ archive | 役目を終えた文書 | 当時のまま残す |

## ① 現役の決めごと（これが正）

| 知りたいこと | 読む場所 |
| --- | --- |
| 開発方針・環境分離・セキュリティ・アプリ一覧（Claude が毎ターン読む） | [../CLAUDE.md](../CLAUDE.md)、各アプリの `CLAUDE.md` |
| 環境構築から PR まで | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| ブランチ・PR・版の付け方・リリース・レビューの棚卸し | [branching.md](branching.md) |
| デプロイの仕組み（GitHub Actions → GHCR → VPS・戻し方） | [deploy-pipeline.md](deploy-pipeline.md) |
| VPS の構成と日常運用 | [ops/vps-setup.md](ops/vps-setup.md) |
| DB のバックアップと復元 | [ops/db-backup-restore.md](ops/db-backup-restore.md) |
| GitHub 側の設定（ruleset・環境・ラベル） | [ops/github-repo-settings.md](ops/github-repo-settings.md) |
| URL・id・データの持ち方・壊してはいけない契約 | [ia.md](ia.md) |
| 画面に出す言葉のルール | [wording.md](wording.md) |
| どの仕事にどのモデルを使うか | [ai-models.md](ai-models.md) |
| MCP サーバー（認証・ツール一覧） | [mcp-server.md](mcp-server.md) |
| v4 の画面仕様（**モックが正**）と設計トークン | [design/v4/README.md](design/v4/README.md)（世代の注意は [design/v4/mockups/README.md](design/v4/mockups/README.md)） |
| 版の下書きの書き方 | [changelog.d/README.md](changelog.d/README.md) |
| archive の規約 | [archive/README.md](archive/README.md) |

## ② 計画・設計（進行中・判断待ち）

| 文書 | 何の計画か |
| --- | --- |
| [v4-plan.md](v4-plan.md) | v4 刷新の大前提（モックが正）・スコープ・用語（凍結／凍結解除中／廃止）・段取り |
| [v4-native-ui-plan.md](v4-native-ui-plan.md) | 全画面を macOS/iOS ネイティブ級にする取り組み（2026-08〜）。監査の元データは [v4-native-ui-audit-2026-08-20.md](v4-native-ui-audit-2026-08-20.md) |
| [v4-mock-deviations.md](v4-mock-deviations.md) | モックに合わせる作業一覧と、実害が出るので止める4件 |
| [reorg-2026-10-plan.md](reorg-2026-10-plan.md) | 2026年10月の事業再編（社名変更・計上会社の2社化・案件番号の改番）。実装済みと判断待ち（§9）の区別は状態欄 |
| [core-redesign-plan.md](core-redesign-plan.md) | 案件・タスク・AI・共有の根源整理 |
| [project-ledger-simplification-plan.md](project-ledger-simplification-plan.md) → [project-ledger-phase-c-design.md](project-ledger-phase-c-design.md) | 案件台帳の項目整理と Phase C の詳細設計 |
| [ops/calendar-dedup-plan.md](ops/calendar-dedup-plan.md) | カレンダー二重登録の解消の残りの段取り |
| [design/gpm-model.md](design/gpm-model.md)・[design/gpm-merge.md](design/gpm-merge.md) | プロジェクト管理（GLS-B）のデータの持ち方と一本化 |
| [design/v4/qsheet-v4-coding/README.md](design/v4/qsheet-v4-coding/README.md) | 制作技術支援（Qシート）作り直しのコーディング設計（段 00〜14）と実装設計 [impl/](design/v4/qsheet-v4-coding/impl/README.md) |
| [design/qsheet-recording-streaming.md](design/qsheet-recording-streaming.md) | 収録設定・配信設定の設計 |
| [reviews/qsheet-techops-migration-plan.md](reviews/qsheet-techops-migration-plan.md) | `qsheet` → `techops` 改名の移行計画（残りは旧 URL の撤去判断） |
| [reviews/techops-ui-unification-plan.md](reviews/techops-ui-unification-plan.md) | 制作技術支援の UI 統一計画 |
| [reviews/permission-model-simplification-plan.md](reviews/permission-model-simplification-plan.md) | 権限モデルの単純化（実装済み。決めごとの根拠として残す） |
| [architecture/box-folder-structure.md](architecture/box-folder-structure.md) | 案件ごとの BOX フォルダ構造 |

## ③ 記録・台帳（読む・追記する。書き換えない）

索引は [reviews/README.md](reviews/README.md)。主なもの:

| 文書 | 種類 |
| --- | --- |
| [reviews/codex-findings-v4.md](reviews/codex-findings-v4.md) | **レビュー指摘の棚卸し台帳**（追記型）。マージしたら `npm run reviews:debt` で移す |
| [reviews/application-review-2026-09-08.md](reviews/application-review-2026-09-08.md) | アプリ全体のコードレビュー（認証・認可の修正記録） |
| [reviews/2026-09-06-mail-intake-taxonomy.md](reviews/2026-09-06-mail-intake-taxonomy.md) | メール自動仕分けの棚卸し（`mail-intake` スキルの基礎資料） |
| [reviews/2026-09-05-terminology-review.md](reviews/2026-09-05-terminology-review.md) | 用語・表現のゼロベース見直し |
| [reviews/2026-09-01-multiagent-app-review.md](reviews/2026-09-01-multiagent-app-review.md)・[reviews/2026-08-24-logic-audit.md](reviews/2026-08-24-logic-audit.md)・[reviews/security-review-2026-08-18.md](reviews/security-review-2026-08-18.md) | 実施済みのレビュー・監査 |
| [reviews/db-drift-audit.md](reviews/db-drift-audit.md)・[reviews/phase3-2-plan.md](reviews/phase3-2-plan.md) | DB スキーマの監査と顧客系 FK 移行の記録 |
| [reviews/client-v4-build-log.md](reviews/client-v4-build-log.md) ほか `*-build-log.md` | 各アプリの `CLAUDE.md` から外した経緯の記録 |
| [version-history.md](version-history.md) | 版ごとの変更（全件・全文） |

## ④ だれでも読める説明書（guide/ — エンジニアでない人はここから）

目次は [guide/README.md](guide/README.md)。ONAiR とは・用語集・本番と検証・直しが届くまで・v4 の今・頼み方。

## ⑤ 生成物（手で直さない）

| ファイル | 作り方 |
| --- | --- |
| [v4-progress.md](v4-progress.md) | `node scripts/v4-progress.mjs --write`。画面のファイルを読んで判定する。v4 の PR では毎回作り直す |
| `client/public/version-history.json` | `scripts/generate-version-history.mjs`（client の `predev` / `prebuild`）。入力は `CLAUDE.md` の最新3件 ＋ [version-history.md](version-history.md) |
| `design/v4/<アプリ>.md`・`design/v4/_tokens-observed.md` | `node scripts/extract-v4-design.mjs`（モックから項目名と確定値を抜き出す） |
| [mcp-server.md](mcp-server.md) のツール一覧 | 状態欄を参照（`scripts/generate-mcp-tools.mjs`） |

## ⑥ 作業場（changelog.d/）

作業 PR は版番号を触らず、[changelog.d/](changelog.d/) に載せたい文を1ファイル置く（[changelog.d/README.md](changelog.d/README.md)）。
リリース時に `npm run release:notes` が集めて消す。

## ⑦ archive/ — 役目を終えた文書

役目を終えた日付付き文書は [archive/2026/](archive/2026/) へ移す（規約は [archive/README.md](archive/README.md)）。
中身は当時のまま。移動で切れたリンクだけ直す。
