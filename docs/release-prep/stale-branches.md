# リモートの残骸ブランチの棚卸し（判断#7）

**削除はユーザー承認後。この表は2026-08-23時点の実測。**
（`git fetch --all --prune` → `git fetch --unshallow` で完全な履歴を取り、
`git merge-base --is-ancestor` と `git log origin/main..origin/<枝>` で確認。
関連PRは GitHub API で head ブランチから引いた）

対象外: `main` / `claude/v4-release-prep-bh93vf`（リリース準備の作業元）/
`chore/md-links-and-migration-lint`（PR #349。表の作成時は open・**その後マージ済み**なので、
GitHub がブランチを自動削除していなければこれも削除可）。
リモートに残るブランチはこの3本＋下表の7本で**全部**。
release/4.2.x などマージ済みの作業ブランチは既にリモートから消えていた。

| ブランチ | 最終コミット | mainに完全マージ済みか | 未マージコミット | 関連PR | 推奨 |
| --- | --- | --- | --- | --- | --- |
| `claude/production-release-prep-c7zlg5` | 2026-08-16 | ⭕ | 0件 | #165 マージ済み | **削除可** |
| `fix/release-tooling-titles` | 2026-08-16 | ⭕ | 0件（下の判断メモ参照） | #156 マージ済み | **削除可** |
| `fix/version-history-crlf` | 2026-08-16 | ❌ | 1件: `9039bbd`「chore(docs): 下書きを枝の名前に合わせた」— 対象の `changelog.d` 下書きは v4.1.1 リリースで消費済みで main に存在しない | #157 マージ済み | **削除可**（未マージ分は無価値） |
| `codex/fix-codex-review-issues-for-pr-#190` | 2026-08-18 | ❌ | 1件: `c0e5591`「fix(db): add follow-up payment terms migration」（migration 197） | #191 **未マージclose** | **削除可**（main の migration 198 が同目的で置き換え済み。さらに 207/208 で customers/vendors 自体を削除済みのため完全に陳腐化） |
| `claude/unified-task-management-refd5o` | 2026-08-20 | ❌ | 1件: `fbc8305`「docs(reviews): PR #258 のレビュー0件マージを棚卸しに記録する」— main の `codex-findings-v4.md` に #258 の記録が**無い** | #258 マージ済み | ~~記録を取り込んでから削除~~ → **削除可**（記録は PR #356 で `codex-findings-v4.md` へ回収済み・2026-08-23） |
| `claude/script-popup-width-input-j6v6y5` | 2026-08-22 | ❌ | 1件: `f4ff81e`「docs(reviews): PR #325 のマージ後の棚卸しを記録した」— main に #325 の棚卸し記録が**無い**（直さず残した指摘3件を含む） | #325 マージ済み | ~~記録を取り込んでから削除~~ → **削除可**（記録と残した指摘3件は PR #356 で回収済み・2026-08-23） |
| `claude/outlook-calendar-sync-approval-hab129` | 2026-08-16 | ❌ | 1件: `5e6f916`「docs(ops): Outlook カレンダー連携の Entra ID アプリ登録依頼書を追加」（`docs/ops/outlook-calendar-entra-app-request.md`・191行・main に存在しない） | PRなし | **要判断** — Outlook 連携を進めるなら取り込み、やめたなら削除 |

## `fix/release-tooling-titles` の判断メモ

事前情報では「未マージ2コミット（リリース見出し修正・CRLF対応）が残っている」とされていたが、
**実測では枝の先端 `7f679b4` が main の祖先**（`git merge-base --is-ancestor` が真）で、
2コミットとも main に入っている:

- `537bdc8`「fix(docs): 版の履歴が v4.1.0 を別の名前で呼んでいたのを直した」→ PR #156 でマージ
- `7f679b4`「fix(docs): 見出しの探し方を CRLF でも通るようにした」→ PR #157（`fix/version-history-crlf` 経由）でマージ

「未マージ2件」に見えたのは、この環境の clone が **shallow** で merge-base が引けなかったため
（`git fetch --unshallow` 後に解消）。**結論: cherry-pick する価値は無し・破棄（削除）でよい。**

## 削除の実行（承認後）

```bash
git push origin --delete \
  claude/production-release-prep-c7zlg5 \
  fix/release-tooling-titles \
  fix/version-history-crlf \
  'codex/fix-codex-review-issues-for-pr-#190'
# 棚卸し記録2件（#258 / #325）は先に取り込みの小PRを出してから、
# Outlook 依頼書はユーザー判断が出てから、それぞれ削除する
```
