#!/usr/bin/env bash
#
# 2026-07-31 のブランチ整理を実行する。
#
# 何をするか (この順番でしかできない):
#   1. 未マージの固有コミットを持つ 7 本を archive タグに退避して push
#   2. リリースタグ (v3.1.5 = 刷新の到達点・本番未投入 / v3.2.0〜2 = 実際の本番) を push
#   3. claude/* の 40 本を削除
#   4. dev ブランチを削除              ← main に新しい CI/デプロイが入ってからでないと検証環境が止まる
#
# なぜスクリプトにしてあるか:
#   ブランチ 41 本の削除は取り消しにくいので、「何を消すのか」を SHA まで
#   固定して読める形にしてから流す。--dry-run で全部確認できる。
#
# ★ 誰が流すか (2026-08-04 に再確認):
#   **Claude Code のセッションからは流せない。** git プロキシがタグ作成と
#   ブランチ削除を組織ポリシーとして拒否する:
#       error: RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
#   `git push --dry-run` は通ってしまうので、dry-run では気づけない。
#   実際に流したときリモートは 1 バイトも変わらなかった (タグ0本・ブランチ45本のまま)
#   ので、途中で止まっても壊れない。
#
#   流す方法は2つ。どちらでも同じことをする:
#     ① GitHub の画面から (おすすめ・このスクリプトを触らなくてよい)
#        Actions → Cleanup branches → Run workflow
#          mode = dry-run … 見るだけ
#          mode = execute + confirm = cleanup … 実行
#        → .github/workflows/cleanup-branches.yml
#        ※ ワークフローは**デフォルトブランチ (main) にある分しか呼べない**ので、
#          この仕組みが入った PR がマージされてから使えるようになる。
#     ② 手元のターミナル (通常の GitHub 認証) から下の使い方で
#
#   流したあとの想定: リモートのタグ 11 本 (archive 7 + v3.1.5/v3.2.0/v3.2.1/v3.2.2)、
#   ブランチ 45 → 4 本 (main / release/v3 / rollback/old-ui / 作業中のもの)
#
# ★ GitHub の Releases 画面でタグを作ってはいけない:
#   タグを作る入口は Releases しかなく、Release を**公開**すると deploy.yml の
#   `release: types: [published]` が発火して **そのタグの中身が本番に出る**。
#   v3.1.5 は本番未投入、archive/* は古い作業ブランチなので、本番に出てはいけない。
#   (下書きのままではタグが作られないので、そもそも目的も果たせない)
#
# 使い方 (手元のターミナルから流す場合):
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

# (b) dev を消して失われるものが無いか。
#     消して良いのは次のどちらか:
#       - dev == main                      … 中身が同じ
#       - dev に固有のコミットが0件 かつ    … main から見て先に進んでいない
#         その位置を release/v3 が指している … v3 のコードは別のブランチに残る
#     v3.2.0 で v3.1.5 からロールバックしたため、dev (=v3.1.5) は main の祖先ではなく
#     「別の枝の先端」になっている。単純な SHA 比較だけだと永久に消せない。
DEV_SHA=$(git rev-parse --verify --quiet "$REMOTE/dev" || true)
MAIN_SHA=$(git rev-parse "$REMOTE/main")
if [ -z "$DEV_SHA" ]; then
  echo "  ✓ dev は既に無い"
  DELETE_DEV=false
elif [ "$DEV_SHA" = "$MAIN_SHA" ]; then
  echo "  ✓ dev と main は同じコミット ($(git rev-parse --short "$MAIN_SHA"))"
else
  DEV_ONLY=$(git rev-list --count "$REMOTE/main..$REMOTE/dev")
  REL_SHA=$(git rev-parse --verify --quiet "$REMOTE/release/v3" || true)
  echo "  · dev と main は別の位置:"
  echo "      dev  = $(git rev-parse --short "$DEV_SHA")"
  echo "      main = $(git rev-parse --short "$MAIN_SHA")"
  echo "      dev にしかないコミット: $DEV_ONLY 件"
  if [ "$DEV_ONLY" = "0" ]; then
    echo "  ✓ dev に固有のコミットは無い"
    DELETE_DEV=true
  elif [ -n "$REL_SHA" ] && [ "$REL_SHA" = "$DEV_SHA" ]; then
    echo "  ✓ 同じコミットを release/v3 が指している → dev を消してもコードは残る"
    DELETE_DEV=true
  else
    echo "    → dev は消さない。固有のコミットがあり、release/v3 も別の位置を指している。"
    echo "      先に main か release/v3 へ取り込んでからもう一度流してください。"
    DELETE_DEV=false
  fi
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
# 2. リリースタグ
# ─────────────────────────────────────────────────────────────
# **v3.1.5 は本番に出ていない**。UI/UX 刷新を入れた到達点ではあるが、
# その後 v3.2.0 で刷新前の画面へロールバックしたため、実際に本番で
# 稼働したのは v3.2.x 系。タグの意味を取り違えないよう分けて打つ。
#
#   v3.1.5   … UI/UX 刷新の到達点 (v4 が参照する下地・本番未投入)
#   v3.2.0〜 … 実際に本番で稼働したリリース
log "リリースタグ"

tag_at() {  # tag_at <tag> <sha> <件名> <補足>
  local tag="$1" sha="$2" subject="$3" note="$4"
  if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
    echo "  - $tag (既にある)"
  else
    if ! git rev-parse --verify --quiet "$sha^{commit}" >/dev/null; then
      echo "  ! $tag: コミット $sha が見つかりません (fetch 済みか確認してください)" >&2
      return 1
    fi
    run git tag -a "$tag" "$sha" -m "$subject" -m "$note"
    ok "$tag → $(git rev-parse --short "$sha")"
  fi
  RELEASE_TAGS+=("refs/tags/$tag")
}

RELEASE_TAGS=()
tag_at v3.1.5 '6909a78d62de7374deb543a81f039901eece670c' \
  "v3.1.5 — 見積が案件化しても消えないようにし、見積=売上=仕入を1つのデータにした / 不課税の追加 / お金トップからの仕入・販管費入力" \
  "UI/UX 刷新 (v2.9.251〜) の到達点。**本番には投入していない** — v3.2.0 で刷新前の画面へロールバックしたため。v4 はここを下地として参照する (docs/branching.md)。"
tag_at v3.2.0 '5c278929105cdf7704108e997e3b0421718770b7' \
  "v3.2.0 — UI/UX 刷新の直前 (v2.9.250 相当) へロールバック" \
  "v4 に向けて画面を作り直すための巻き戻し。DB は戻していない。ここから本番は v3.2.x 系で稼働している。"
tag_at v3.2.1 '4aa5685a' \
  "v3.2.1 — 内覧会 来場予約を当日の受付が回る形に復元" \
  "同行者ごとの受付 / 開催日ごとの受付ページ / 受付のための検索。"
tag_at v3.2.2 '13adabeb' \
  "v3.2.2 — 検索の権限漏れを塞ぎ、カレンダーの二重登録を止めた" \
  "権限の無いログインユーザーに案件名・お客様名が見えていた穴を修正 (セキュリティ)。"

if [ ${#RELEASE_TAGS[@]} -gt 0 ]; then
  run git push "$REMOTE" "${RELEASE_TAGS[@]}"
fi

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
# 5. rollback/old-ui — **このスクリプトでは消さない**
# ─────────────────────────────────────────────────────────────
# 本番 (gmo-onair.jp) は現在このブランチから出ている。main に取り込む PR が
# マージされ、**main からデプロイし直して本番が同じ内容で焼けることを確認する
# まで**は、戻り先として残しておく必要がある。
#
# 確認できたら手で消す:
#   git push origin --delete rollback/old-ui
#   (中身は v3.2.0 / v3.2.1 / v3.2.2 のタグで辿れる)
log "rollback/old-ui"
if git ls-remote --exit-code --heads "$REMOTE" rollback/old-ui >/dev/null 2>&1; then
  echo "  - 残した (本番の出所。main への取り込みを確認してから手で削除)"
else
  echo "  - 既に無い"
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

