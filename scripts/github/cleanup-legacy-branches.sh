#!/usr/bin/env bash
#
# 2026-07-31 のブランチ整理を実行する。
#
# 何をするか (この順番でしかできない):
#   1. 未マージの固有コミットを持つ 7 本を archive タグに退避して push
#   2. v3.1.5 タグを打って push        ← 凍結時点の本番コード
#   3. claude/* の 40 本を削除
#   4. dev ブランチを削除              ← main に新しい CI/デプロイが入ってからでないと検証環境が止まる
#
# なぜスクリプトにしてあるか:
#   ブランチ 41 本の削除は取り消しにくいので、「何を消すのか」を SHA まで
#   固定して読める形にしてから流す。--dry-run で全部確認できる。
#   (Claude Code のセッションからは push の権限でタグ作成とブランチ削除が
#    できなかったため、この形で残してある)
#
# 使い方:
#   bash scripts/github/cleanup-legacy-branches.sh --dry-run   # 何をするか見るだけ
#   bash scripts/github/cleanup-legacy-branches.sh             # 実行
#
# 消したあとに戻したくなったら:
#   git fetch origin --tags
#   git switch -c <新しい名前> archive/2026-07-31/<名前>
#
# 全体の方針: docs/branching.md
#
set -euo pipefail

REMOTE="${REMOTE:-origin}"
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

cd "$(dirname "$0")/../.."

run() {
  if $DRY_RUN; then printf '  (dry-run) %s\n' "$*"; else "$@"; fi
}
# dry-run では「やった」と読める行を出さない (何もしていないので)
ok() { $DRY_RUN || printf '  ✓ %s\n' "$*"; }
log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

git fetch "$REMOTE" --prune --tags

# ─────────────────────────────────────────────────────────────
# 0. 安全確認
# ─────────────────────────────────────────────────────────────
log "安全確認"

# (a) 新しい CI / デプロイが main に入っているか。
#     入る前に dev を消すと、検証環境へのデプロイ経路が無くなる。
if git cat-file -e "$REMOTE/main:.github/workflows/ci.yml" 2>/dev/null; then
  echo "  ✓ main に .github/workflows/ci.yml がある (新しいデプロイ経路が有効)"
  DELETE_DEV=true
else
  echo "  ⚠ main に .github/workflows/ci.yml が無い。"
  echo "    → 新しい CI/デプロイの PR をマージする前なので、dev は残す。"
  echo "      (claude/* の削除とタグ付けだけ行う。マージ後にもう一度流せば dev も消える)"
  DELETE_DEV=false
fi

# (a-2) dev がデフォルトブランチのままだと、そもそも**削除できない** (GitHub が拒否する)。
#       先にデフォルトブランチを main に変える必要がある。
DEFAULT_BRANCH=$(git symbolic-ref --quiet --short "refs/remotes/$REMOTE/HEAD" 2>/dev/null | sed "s|^$REMOTE/||" || true)
if [ "$DEFAULT_BRANCH" = "dev" ]; then
  echo "  ⚠ dev がデフォルトブランチのままです。"
  echo "    デフォルトブランチは削除できないので、先に main へ切り替えてください:"
  echo "      Settings → General → Default branch → main"
  echo "      (または bash scripts/github/apply-repo-settings.sh)"
  DELETE_DEV=false
elif [ -n "$DEFAULT_BRANCH" ]; then
  echo "  ✓ デフォルトブランチ: $DEFAULT_BRANCH"
fi

# (b) dev と main が同じコミットを指しているか。
#     ずれていたら dev にしかない変更があるので消さない。
DEV_SHA=$(git rev-parse --verify --quiet "$REMOTE/dev" || true)
MAIN_SHA=$(git rev-parse "$REMOTE/main")
if [ -z "$DEV_SHA" ]; then
  echo "  ✓ dev は既に無い"
  DELETE_DEV=false
elif [ "$DEV_SHA" = "$MAIN_SHA" ]; then
  echo "  ✓ dev と main は同じコミット ($(git rev-parse --short "$MAIN_SHA"))"
else
  echo "  ⚠ dev と main がずれている:"
  echo "      dev  = $(git rev-parse --short "$DEV_SHA")"
  echo "      main = $(git rev-parse --short "$MAIN_SHA")"
  echo "      dev にしかないコミット: $(git rev-list --count "$REMOTE/main..$REMOTE/dev") 件"
  echo "    → dev は消さない。先に main へ取り込んでからもう一度流してください。"
  DELETE_DEV=false
fi

# ─────────────────────────────────────────────────────────────
# 1. archive タグ (未マージの固有コミットを持つ 7 本)
# ─────────────────────────────────────────────────────────────
# SHA を直接書いてある。ローカルの状態に依存せず、いつ流しても同じものを指す。
log "archive タグを作る"

ARCHIVE_TAGS=()

archive_tag() { # archive_tag <タグ名> <SHA> <一行説明> <補足>
  local name="$1" sha="$2" summary="$3" note="$4"
  local tag="archive/2026-07-31/$name"
  if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
    echo "  - $tag (既にある)"
    ARCHIVE_TAGS+=("$tag")
    return 0
  fi
  if ! git cat-file -e "$sha" 2>/dev/null; then
    echo "  ✗ $tag: コミット $sha が見つからない (元のブランチが既に消えている?)" >&2
    return 1
  fi
  run git tag -a "$tag" "$sha" -m "$summary" -m "$note" -m "2026-07-31 のブランチ整理で退避。復元: git switch -c <新しい名前> $tag"
  ARCHIVE_TAGS+=("$tag")
  ok "$tag"
}

archive_tag 'accounting-import-phase1' '3daed17d5ba08e8d8ef7958bb54284cc81f89f2d' \
  "経理データ取込 Phase 0/1 (Layer A 生データ取込み API + スキーマ調査レポート)" \
  "退避元: claude/accounting-schema-survey-0UOj3 (main に無いコミット 6 件)。PR #28 の中身。main には入っていない。migration 番号 087 が現在の main と衝突しているので、使うときは付け替えが必要"
archive_tag 'presentation-deck' '34ffde1ca0e7de9275d7e6dbfdf99ca4ddda70a8' \
  "社長プレゼン資料 (pptx 25枚 + 画面画像 + 生成スクリプト)" \
  "退避元: claude/app-presentation-deck-GIkL1 (main に無いコミット 6 件)。main には入っていない"
archive_tag 'calendar-relink-hotfix' '2b3fca446f8b0b6ffa66be0afef35937af195e9c' \
  "カレンダー再連携が「連携に失敗」になる不具合の修正" \
  "退避元: claude/calendar-feature-rd11f5 (main に無いコミット 1 件)。現在の main が同内容を含む (該当ファイルの差分は空)。念のための退避"
archive_tag 'qsheet-csv-import-v2.9.166' 'd05c549128f6d844d2009021745b0506451ea981' \
  "Qシート CSV インポート (ロール尺/CM/VTR) + サーバー楽観ロック" \
  "退避元: claude/deploy-v2.9.166 (main に無いコミット 4 件)。現在の main が同内容をより新しい形で含む (confirm() → confirmAction 等)。念のための退避"
archive_tag 'interactive-awards-link' 'd3009b51229cd87328a288e6ed297af032148673' \
  "インタラクティブ ↔ 表彰CG 連携 API" \
  "退避元: claude/interactive-features-api-GwIcC (main に無いコミット 1 件)。client-interactive は別 VPS (interactive.gmo-onair.jp) に切り出し済みなので、当時のコードは main に無い"
archive_tag 'interactive-split-out' '5e04fa68540585b926eadcdc929fed72df8ed7a4' \
  "インタラクティブを別 VPS に切り出した当時のコミット + 翻訳ツールのリンク追加" \
  "退避元: claude/loving-davinci-jkBQc (main に無いコミット 2 件)。切り出し自体は main に反映済み。当時の client-interactive のコードを見たいとき用"
archive_tag 'vps-bootstrap-scripts' 'e1fc232f5bbcc8f926ca149f66bf6a8ac34c0b46' \
  "新 VPS 構築用 bootstrap スクリプト3本 + DEPLOY_CONOHA.md 全面版" \
  "退避元: claude/setup-conohavps-rbJri (main に無いコミット 3 件)。main には入っていない (scripts/vps/1-bootstrap.sh / 2-deploy.sh / 3-issue-cert.sh)"

log "archive タグを push"
# ワイルドカードの refspec は展開されるか git のバージョンで挙動が変わるので、
# 作ったタグ名を明示して渡す。
if [ ${#ARCHIVE_TAGS[@]} -gt 0 ]; then
  run git push "$REMOTE" "${ARCHIVE_TAGS[@]}"
else
  echo "  - push するタグが無い"
fi

# ─────────────────────────────────────────────────────────────
# 2. v3.1.5 タグ (凍結時点の本番コード)
# ─────────────────────────────────────────────────────────────
log "v3.1.5 タグ"
V3_SHA='6909a78d62de7374deb543a81f039901eece670c'
if git rev-parse --verify --quiet refs/tags/v3.1.5 >/dev/null; then
  echo "  - v3.1.5 (既にある)"
else
  run git tag -a v3.1.5 "$V3_SHA" \
    -m "v3.1.5 — 見積が案件化しても消えないようにし、見積=売上=仕入を1つのデータにした / 不課税の追加 / お金トップからの仕入・販管費入力" \
    -m "v3 系はこのバージョンで凍結。以降の保守は release/v3 ブランチで行う。本番 (gmo-onair.jp) はこのコミットで稼働していた。v4 の開発は main で進める (docs/branching.md)。"
  ok "v3.1.5 → $(git rev-parse --short "$V3_SHA")"
fi
run git push "$REMOTE" refs/tags/v3.1.5

# ─────────────────────────────────────────────────────────────
# 3. claude/* を削除
# ─────────────────────────────────────────────────────────────
# 下の 33 本は main に全コミットが入っている (ahead=0) ので、消しても何も失われない。
# 続く 7 本は上で archive タグに退避したもの。
log "claude/* を削除 (40 本)"

MERGED_BRANCHES=(
  'claude/add-award-countdown-zUEPt de581756'
  'claude/add-kanban-task-management-7knFQ 748a6d99'
  'claude/anken-kanri-yomi-w2elq7 03cd9c91'
  'claude/app-header-user-manuals-e56jfu d1b23bb1'
  'claude/award-ceremony-patterns-XDyY0 cd8b997b'
  'claude/blissful-franklin-XIqmS b42acfbc'
  'claude/calendar-bug-open-house-features-bo0h9m 49acf47d'
  'claude/chatgpt-api-expansion-bugs-77occj 9df8c8b3'
  'claude/compassionate-brahmagupta-3080p 56551806'
  'claude/daily-operations-app-fdtuny 3f17ea11'
  'claude/elegant-ptolemy-8YJdP 2e596e68'
  'claude/epic-thompson-xNsiI 681cfbeb'
  'claude/funny-tesla-esno0n 401aad47'
  'claude/gmo-onair-deploy-optimization-dbzxum da399f1f'
  'claude/gmo-onair-platform-requirements-zymhku c3607a94'
  'claude/gmo-onair-ui-ux-renewal-5v0l3w 791c4d49'
  'claude/improve-q-sheet-app-4ReF8 bcecebdf'
  'claude/jolly-allen-ezhomv 4dcf2247'
  'claude/keen-babbage-3duuw 52530d6c'
  'claude/line-item-period-edit-re44q8 b60f4278'
  'claude/mcp-server-case-calendar-budget-q2axk0 47fdae13'
  'claude/onair-improvement-requests-pbg5nk 6909a78d'
  'claude/open-house-reservation-features-23pto3 c3ca451a'
  'claude/program-uiux-review-v03pka a91bb62d'
  'claude/quotation-item-reorder-linebreak-hnihj3 18f956f3'
  'claude/realtime-cg-generalization-me82n 040766ff'
  'claude/settlement-import-error-luo4d9 7d02d531'
  'claude/site-tree-uiux-redesign-8kos4a 5eb86c2e'
  'claude/studio-security-card-management-k17z9e daef453a'
  'claude/timer-viewer-count-features-hn6i2i fa16881d'
  'claude/uiux-refresh-ws6mg8 33817f46'
  'claude/viewer-counter-zoom-teams-7ARST 3420ed60'
  'claude/x-point-pdf-registration-j36q4h 7f72d874'
)

ARCHIVED_BRANCHES=(
  'claude/accounting-schema-survey-0UOj3 3daed17d'  # → archive/2026-07-31/accounting-import-phase1
  'claude/app-presentation-deck-GIkL1 34ffde1c'  # → archive/2026-07-31/presentation-deck
  'claude/calendar-feature-rd11f5 2b3fca44'  # → archive/2026-07-31/calendar-relink-hotfix
  'claude/deploy-v2.9.166 d05c5491'  # → archive/2026-07-31/qsheet-csv-import-v2.9.166
  'claude/interactive-features-api-GwIcC d3009b51'  # → archive/2026-07-31/interactive-awards-link
  'claude/loving-davinci-jkBQc 5e04fa68'  # → archive/2026-07-31/interactive-split-out
  'claude/setup-conohavps-rbJri e1fc232f'  # → archive/2026-07-31/vps-bootstrap-scripts
)

delete_branch() { # delete_branch "<ブランチ名> <調査時の短縮SHA>"
  local br="${1%% *}" expect="${1##* }"
  local actual
  actual=$(git rev-parse --verify --quiet "$REMOTE/$br" || true)
  if [ -z "$actual" ]; then
    echo "  - $br (既に無い)"
    return 0
  fi
  # 調査した 2026-07-31 から先端が動いていたら消さない。
  # あとから誰かが push した可能性があり、その分は調査対象に入っていない。
  if [ "${actual:0:8}" != "$expect" ]; then
    echo "  ⚠ $br: 調査時と先端が違う (調査時 $expect / 現在 ${actual:0:8}) — 消さずに残す" >&2
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi
  run git push "$REMOTE" --delete "$br"
  ok "削除: $br"
  DELETED=$((DELETED + 1))
}

DELETED=0
SKIPPED=0

echo "  -- main に全コミットが入っている ${#MERGED_BRANCHES[@]} 本 --"
for entry in "${MERGED_BRANCHES[@]}"; do
  delete_branch "$entry"
done

echo "  -- archive タグに退避した ${#ARCHIVED_BRANCHES[@]} 本 --"
for entry in "${ARCHIVED_BRANCHES[@]}"; do
  delete_branch "$entry"
done

if $DRY_RUN; then
  echo "  → 削除する予定 $DELETED 本 / 見送り $SKIPPED 本"
else
  echo "  → 削除 $DELETED 本 / 見送り $SKIPPED 本"
fi

# ─────────────────────────────────────────────────────────────
# 4. dev を削除
# ─────────────────────────────────────────────────────────────
log "dev ブランチ"
if $DELETE_DEV; then
  run git push "$REMOTE" --delete dev
  ok "削除: dev (main と同じ内容だった)"
else
  echo "  - dev は残した (上の安全確認を参照)"
fi

# ─────────────────────────────────────────────────────────────
log "結果"
git fetch "$REMOTE" --prune --tags >/dev/null 2>&1 || true
echo "残っているブランチ:"
git branch -r --format='  %(refname:short)' | grep -v HEAD
echo
echo "タグ:"
git tag -l 'v*' 'archive/*' | sed 's/^/  /'
echo
cat <<'NEXT'
次にやること:
  1. bash scripts/github/apply-repo-settings.sh     ← 分岐保護・環境・ラベル
  2. production 環境の承認者を画面で設定
     https://github.com/terai-takehiro/gmo-onair/settings/environments
  3. 運用の説明は docs/branching.md / CONTRIBUTING.md
NEXT

