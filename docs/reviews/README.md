# docs/reviews — レビューの台帳・計画・記録

- **台帳は [codex-findings-v4.md](codex-findings-v4.md) の1つだけ**（追記型。アーカイブへ移さない）。
- **PR をマージしたら `GITHUB_TOKEN=… npm run reviews:debt` を回し、返していない指摘をこの台帳の表へ移す**（決めごとの正は [docs/branching.md](../branching.md#マージしたらその-pr-のレビューを棚卸しに移す必須)）。マージすると指摘は GitHub の画面から消えるので、書かなければ無かったことになる。

各文書の先頭に「種類／状態／最終確認」の欄がある。種類は4つ。

| 種類 | 意味 |
| --- | --- |
| 台帳 | 追記し続ける。消さない |
| 現役の計画 | まだやることが残っている。残りは各文書の「状態」に書いてある |
| 実施済みの記録 | やったことと、残った課題の記録 |
| 経緯の記録 | 当時の判断の理由を引くためのもの。現役のルールは各アプリの `CLAUDE.md` が正 |

⚠️ **このディレクトリの中でファイルを動かさない・改名しない。** migration（206〜210）や `scripts/*.mjs` のコメント、各アプリの `CLAUDE.md` がパスで参照している。役目を終えた文書は [docs/archive/](../archive/README.md) へ移す。

## 索引（2026-09-08・v4.6.10 時点）

| 文書 | 種類 | 状態 | 一言 |
| --- | --- | --- | --- |
| [codex-findings-v4.md](codex-findings-v4.md) | 台帳 | 追記中 | Codex のレビュー指摘の棚卸し。直さないと決めたものも表から消さない |
| [qsheet-techops-migration-plan.md](qsheet-techops-migration-plan.md) | 現役の計画 | Phase 1〜4 済み。旧 `/qsheet` の二重マウント・Socket.IO ブリッジ・MCP 旧名の撤去時期が未決 | `client-qsheet` → `client-techops` 改名の計画と経緯 |
| [techops-ui-unification-plan.md](techops-ui-unification-plan.md) | 現役の計画 | 段0＋ブロック A〜G 済み（PR #647）。H〜O が残り | 制作技術支援の見た目の統一（`PageShell`・`PageHeader`・型スケール） |
| [application-review-2026-09-08.md](application-review-2026-09-08.md) | 実施済みの記録 | PR #636 でマージ済み。継続課題3件 | 認証・Socket・同時更新の全体コードレビュー |
| [security-review-2026-08-18.md](security-review-2026-08-18.md) | 実施済みの記録 | SEC-01 済み。SEC-02/04/05/06 が残課題 | セキュリティレビュー（SSRF 修正と残課題） |
| [2026-09-06-mail-intake-taxonomy.md](2026-09-06-mail-intake-taxonomy.md) | 実施済みの記録 | 現役の基礎資料（`.claude/skills/mail-intake/` が参照） | 受信メール1か月分の種別カタログと仕分け決定表の根拠 |
| [2026-09-05-terminology-review.md](2026-09-05-terminology-review.md) | 実施済みの記録 | 段1・段8 反映済み。残りは個別の PR | 画面文字列 約6,500件の用語見直し（報告のみ） |
| [2026-09-01-multiagent-app-review.md](2026-09-01-multiagent-app-review.md) | 実施済みの記録 | 111件修正済み（PR #538）。`interactive_*` 9テーブルの判断が残り | 14観点のマルチエージェント全方位レビュー |
| [2026-08-24-logic-audit.md](2026-08-24-logic-audit.md) | 実施済みの記録 | 25件修正済み（PR #415〜#424） | 件数不一致・行き止まり・invalidate 漏れの総点検 |
| [db-drift-audit.md](db-drift-audit.md) | 実施済みの記録 | 完了（migration 206/208/209）。`interactive_*` が未判断 | migration に無いのに実DBにあるものの監査 |
| [phase3-2-plan.md](phase3-2-plan.md) | 実施済みの記録 | 完了（migration 200〜204・206〜209） | 会社リスト一本化（`customers`/`vendors` → `companies`）の引き継ぎメモ |
| [permission-model-simplification-plan.md](permission-model-simplification-plan.md) | 実施済みの記録 | 実装済み（migration 210）。区画はいま5つ | 権限区画を 12 → 7 に統合した計画と結果 |
| [client-v4-build-log.md](client-v4-build-log.md) | 経緯の記録 | 追記のみ | 案件管理・財務管理・カレンダー・設定の v4 作り直しの経緯 |
| [techops-build-log.md](techops-build-log.md) | 経緯の記録 | 2026-09-08 起こし | 制作技術支援・計時・視聴者・リアルタイムCGの3つの `CLAUDE.md` から外した経緯と実測（原文のまま） |
| [shared-build-log.md](shared-build-log.md) | 経緯の記録 | 2026-09-08 起こし | `shared/CLAUDE.md` から外したフェーズごとの導入史・当時の実測・判断の理由（原文のまま） |
| [daily-equipment-build-log.md](daily-equipment-build-log.md) | 経緯の記録 | 2026-09-08 起こし | `client-daily/CLAUDE.md`・`client-equipment/CLAUDE.md` から外した経緯と実測（原文のまま） |

## 移した・消した文書（2026-09-08）

- `2026-08-18-token-consumption-analysis.md` → [docs/archive/2026/reviews-2026-08-18-token-consumption-analysis.md](../archive/2026/reviews-2026-08-18-token-consumption-analysis.md)（当時のスナップショット。役目を終えた）
- `2026-04-28-code-health.md`（スタブ）→ 消した。実体は [docs/archive/2026/2026-04-28-code-health.md](../archive/2026/2026-04-28-code-health.md)
