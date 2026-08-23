# docs/ の目次 — どこに何があるか

約170ファイルあるが、**普段読むのは次の4分類だけ**。迷ったらこのページに戻る。

## ① 現役の技術文書（これが正）

| 知りたいこと | 読む場所 |
| --- | --- |
| ブランチ・PR・リリース手順 | [branching.md](branching.md) |
| v4 の開発計画・スコープ・段取り | [v4-plan.md](v4-plan.md) |
| 全画面をネイティブ級にする計画（2026-08〜） | [v4-native-ui-plan.md](v4-native-ui-plan.md)（監査: [v4-native-ui-audit-2026-08-20.md](v4-native-ui-audit-2026-08-20.md)・引き継ぎ: [handoff-2026-08-20-v4-native-ui.md](handoff-2026-08-20-v4-native-ui.md)） |
| デプロイの仕組み（GHCR・キャッシュ・戻し方） | [deploy-pipeline.md](deploy-pipeline.md) |
| 用語の決めごと | [wording.md](wording.md) |
| どの仕事にどのモデルを使うか | [ai-models.md](ai-models.md) |
| MCP のツール一覧 | [mcp-server.md](mcp-server.md) |
| URL・id・データの持ち方の決めごと | [ia.md](ia.md) |
| v4 の画面ごとの仕様・モック | [design/v4/](design/v4/) — **モックが正**（[design/v4/mockups/README.md](design/v4/mockups/README.md) の世代注意を必ず読む）。実装との乖離は [v4-mock-deviations.md](v4-mock-deviations.md) |
| 運用手順（VPS 構築・DB バックアップ・掃除 SQL） | [ops/](ops/) — [vps-setup.md](ops/vps-setup.md)・[db-backup-restore.md](ops/db-backup-restore.md)・[calendar-dedup-plan.md](ops/calendar-dedup-plan.md)（未着手の現役計画） |
| レビューの現役台帳・計画 | [reviews/](reviews/) — [codex-findings-v4.md](reviews/codex-findings-v4.md)（指摘の棚卸し・追記型）・[db-drift-audit.md](reviews/db-drift-audit.md)・[permission-model-simplification-plan.md](reviews/permission-model-simplification-plan.md)・[phase3-2-plan.md](reviews/phase3-2-plan.md)・[qsheet-techops-migration-plan.md](reviews/qsheet-techops-migration-plan.md)・[security-review-2026-08-18.md](reviews/security-review-2026-08-18.md) |
| リリース前の整理の作業場 | [release-prep/](release-prep/) |

## だれでも読める説明書（guide/ — エンジニアでない人はここから）

| 知りたいこと | 読む場所 |
| --- | --- |
| ONAiR とは・アプリ一覧・誰が何に使うか | [guide/what-is-onair.md](guide/what-is-onair.md) |
| 直しが本番に届くまでの流れ | [guide/how-changes-ship.md](guide/how-changes-ship.md) |
| 本番と検証・壊していい場所 | [guide/environments.md](guide/environments.md) |
| 用語集（GLS番号・凍結/廃止・PR/マージ…） | [guide/words.md](guide/words.md) |
| v4 で何をしていて今どこか | [guide/v4-now.md](guide/v4-now.md) |
| 直してほしいときの頼み方 | [guide/asking.md](guide/asking.md) |

## ② 生成物（手で直すな）

| ファイル | 作り方 |
| --- | --- |
| [v4-progress.md](v4-progress.md) | `node scripts/v4-progress.mjs --write` が画面のファイルを読んで生成。v4 の PR では毎回作り直す |
| `client/public/version-history.json` | `scripts/generate-version-history.mjs` が CLAUDE.md（最新3件）＋ [version-history.md](version-history.md) から生成 |
| [version-history.md](version-history.md) | 生成の**入力**（追記型アーカイブ・書式厳守: 1エントリ1行・全体を `(...)` で包む） |

## ③ changelog.d/ は作業場

作業 PR は版番号を触らず [changelog.d/](changelog.d/) に下書きを1つ置く（詳細は [changelog.d/README.md](changelog.d/README.md)）。

## ④ archive/ — 役目を終えた文書

役目を終えた日付付き文書は [archive/](archive/) へ移す（規約は [archive/README.md](archive/README.md) の5行）。
