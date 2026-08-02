#!/usr/bin/env bash
#
# GitHub リポジトリ側の設定を一括で適用する。
#
# ファイルとして置ける設定 (CI・テンプレート・CODEOWNERS・Dependabot) はリポジトリに
# 入っているが、**分岐保護・マージ方法・環境・ラベルは GitHub 側にしか置けない**。
# 画面でポチポチやると再現できないので、ここに全部書いて何度でも流せるようにしてある。
#
# 使い方:
#   gh auth login                      # 一度だけ (admin 権限のあるアカウントで)
#   bash scripts/github/apply-repo-settings.sh
#   bash scripts/github/apply-repo-settings.sh --dry-run   # 何をするか見るだけ
#
# 冪等: 何度流しても同じ状態になる (既にあるものは更新、無いものは作成)。
#
# 詳しい説明と、この設定にした理由: docs/ops/github-repo-settings.md
#
set -euo pipefail

REPO="${REPO:-terai-takehiro/gmo-onair}"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh (GitHub CLI) が必要です: https://cli.github.com/" >&2
  exit 1
fi

log()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
skip() { printf '  (dry-run) %s\n' "$*"; }

api() {
  if $DRY_RUN; then skip "gh api $*"; return 0; fi
  gh api "$@"
}

# ─────────────────────────────────────────────────────────────
# 0. デフォルトブランチ
# ─────────────────────────────────────────────────────────────
# **ここを間違えると後続が静かに的を外す。**
#   - ruleset の `~DEFAULT_BRANCH` が別のブランチを保護してしまう
#   - `workflow_dispatch` は**デフォルトブランチにあるワークフローしか呼べない**
#     (Preview / Deploy を手動実行できない)
#   - PR を作るときの base の既定値が変わる
#   - デフォルトブランチは**削除できない** (cleanup スクリプトが dev を消せない)
log "デフォルトブランチを main にする"
CURRENT_DEFAULT=$(gh api "repos/$REPO" --jq .default_branch 2>/dev/null || echo '?')
if [ "$CURRENT_DEFAULT" = "main" ]; then
  echo "  - 既に main"
else
  echo "  現在: $CURRENT_DEFAULT → main に変更する"
  api "repos/$REPO" -X PATCH -f default_branch=main --silent
fi

# ─────────────────────────────────────────────────────────────
# 1. マージ方法とブランチの自動削除
# ─────────────────────────────────────────────────────────────
# Squash のみ許可: 1つの PR = main の1コミット。
#   途中の「typo 修正」「lint 直し」が履歴に残らず、後から読める形になる。
# merge commit / rebase を切る: 3つ選べる状態だと人によって履歴の形が変わる。
# delete_branch_on_merge: これが無かったので claude/* が 41 本溜まった。
log "マージ方法・ブランチ自動削除"
api "repos/$REPO" -X PATCH \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_auto_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  -F has_issues=true \
  -F has_projects=true \
  --silent

# ─────────────────────────────────────────────────────────────
# 2. 分岐保護 (ruleset)
# ─────────────────────────────────────────────────────────────
# ruleset は同名があれば更新する。旧来の branch protection ではなく ruleset を使うのは
# タグも同じ仕組みで守れるため。
apply_ruleset() {
  local name="$1" payload="$2"
  local id
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id" 2>/dev/null | head -1 || true)

  if $DRY_RUN; then
    skip "ruleset '$name' を $([ -n "$id" ] && echo 更新 || echo 作成)"
    return 0
  fi

  if [ -n "$id" ]; then
    printf '%s' "$payload" | gh api "repos/$REPO/rulesets/$id" -X PUT --input - --silent
    echo "  ✓ 更新: $name"
  else
    printf '%s' "$payload" | gh api "repos/$REPO/rulesets" -X POST --input - --silent
    echo "  ✓ 作成: $name"
  fi
}

# 必須チェックの context は .github/workflows/ci.yml のジョブ ID そのまま。
# ci.yml 側のジョブ ID を変えたらここも変える (変え忘れると静かに無検査になる)。
#
# 対象は `~DEFAULT_BRANCH` ではなく `refs/heads/main` と**明示**する。
# 実際にデフォルトブランチが dev のままだったことがあり、`~DEFAULT_BRANCH` だと
# main ではなく dev を保護してしまう (しかも成功したように見える)。
log "分岐保護: main"
apply_ruleset "main" '{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "checks" },
          { "context": "build" }
        ]
      }
    }
  ]
}'

# release/** : v3 の保守ブランチ。消えると凍結した本番コードの出所が無くなる。
log "分岐保護: release/**"
apply_ruleset "release-branches" '{
  "name": "release-branches",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/release/*"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    }
  ]
}'

# v* タグ = 「本番に何が出たか」の記録そのもの。打ち直されると記録が嘘になる。
log "タグ保護: v*"
apply_ruleset "release-tags" '{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "update" }
  ]
}'

# archive/** タグ = 消したブランチの退避先。消すと戻せなくなる。
log "タグ保護: archive/**"
apply_ruleset "archive-tags" '{
  "name": "archive-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/archive/*"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "update" }
  ]
}'

# ─────────────────────────────────────────────────────────────
# 3. ラベル
# ─────────────────────────────────────────────────────────────
# area:* はブロックアプリごと。「Qシートの残作業」を一覧で出せるようにするため。
log "ラベル"
add_label() {
  local name="$1" color="$2" desc="$3"
  if $DRY_RUN; then skip "label: $name"; return 0; fi
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
  echo "  ✓ $name"
}

add_label 'type:bug'           'd73a4a' '不具合'
add_label 'type:feature'       '0e8a16' '機能の追加・変更'
add_label 'type:user-request'  '005bac' '利用者から上がってきた依頼'
add_label 'type:chore'         'ededed' '設定・依存更新・雑務'
add_label 'type:docs'          '5319e7' 'ドキュメントのみ'

add_label 'area:projects'      'c5def5' '案件管理 (client/)'
add_label 'area:qsheet'        'c5def5' 'Qシート (client-qsheet/)'
add_label 'area:equipment'     'c5def5' '機材管理 (client-equipment/)'
add_label 'area:techsheet'     'c5def5' '技術資料 (client-techsheet/)'
add_label 'area:live'          'c5def5' 'ライブ運用 (client-live/)'
add_label 'area:awards'        'c5def5' 'リアルタイムCG (client-awards/)'
add_label 'area:daily'         'c5def5' 'デイリー (client-daily/)'
add_label 'area:server'        'c5def5' 'サーバー・API'
add_label 'area:shared'        'f9a825' '共通ライブラリ (全アプリに影響)'
add_label 'area:ci'            'ededed' 'CI・デプロイ'
add_label 'area:deps'          'ededed' '依存パッケージ'

add_label 'priority:urgent'    'b60205' '本番の業務が止まっている'
add_label 'priority:high'      'e99695' '次の案件までに必要'
add_label 'ai-feedback-loop'   '6d28d9' 'AI が関わる — 5条件の充足表が必要'

# ─────────────────────────────────────────────────────────────
# 4. 環境 (Environments)
# ─────────────────────────────────────────────────────────────
# 本番だけ承認を必須にする。「誰がいつ本番に出したか」が GitHub に残る。
# reviewers は API から user id で指定する必要があるので、ここでは環境の作成までにして
# 承認者の指定は画面で行う (Settings → Environments → production → Required reviewers)。
log "環境 (staging / production)"
api "repos/$REPO/environments/staging" -X PUT --silent
api "repos/$REPO/environments/production" -X PUT --silent
echo "  ※ production の Required reviewers は画面で設定してください:"
echo "     https://github.com/$REPO/settings/environments"

log "完了"
cat <<'DONE'
  この後、画面でしかできない設定が2つ残ります:

  1. production 環境の承認者 (Required reviewers)
     https://github.com/terai-takehiro/gmo-onair/settings/environments
     → production → Required reviewers に自分を追加

  2. Actions の権限
     https://github.com/terai-takehiro/gmo-onair/settings/actions
     → Workflow permissions: Read repository contents and packages permissions
     → "Allow GitHub Actions to create and approve pull requests" は OFF のまま

  理由と全体像: docs/ops/github-repo-settings.md
DONE
