#!/usr/bin/env bash
# =============================================================================
# GMO ONAiR — VPS deploy (アプリ層)
# =============================================================================
# 1-bootstrap.sh の後で実行する。
#   - main を /root/gmo-onair に clone (既にあれば fetch)
#   - dev worktree を /root/gmo-onair-dev に展開
#   - .env が無ければランダム秘密値でテンプレートを生成
#   - docker compose build & up
#   - DB バックアップ cron を仕込む
#
# 想定実行ユーザー: root
# 冪等性:           何度実行しても壊れない
#
# 環境変数 (任意):
#   GIT_REMOTE  - clone する URL (default: https://github.com/terai-takehiro/gmo-onair.git)
#   APP_DIR     - main の展開先 (default: /root/gmo-onair)
#   DEV_DIR     - dev worktree (default: /root/gmo-onair-dev)
#
# このスクリプトが終わったら DNS を新 VPS の IP に向けてから 3-issue-cert.sh。
# =============================================================================
set -euo pipefail

GIT_REMOTE="${GIT_REMOTE:-https://github.com/terai-takehiro/gmo-onair.git}"
APP_DIR="${APP_DIR:-/root/gmo-onair}"
DEV_DIR="${DEV_DIR:-/root/gmo-onair-dev}"

log()  { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "root で実行してください"
command -v docker >/dev/null      || die "Docker 未インストール。先に 1-bootstrap.sh を実行"
docker compose version >/dev/null || die "docker compose plugin 未インストール"

# -----------------------------------------------------------------------------
# 1. main を clone / fetch
# -----------------------------------------------------------------------------
log "[1/6] main を $APP_DIR に展開"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$GIT_REMOTE" "$APP_DIR"
fi
git -C "$APP_DIR" fetch --all --prune
git -C "$APP_DIR" checkout main
git -C "$APP_DIR" reset --hard origin/main
log "    HEAD: $(git -C "$APP_DIR" log --oneline -1)"

# -----------------------------------------------------------------------------
# 2. dev worktree を展開 (compose の app_dev.build.context 用)
# -----------------------------------------------------------------------------
log "[2/6] dev worktree を $DEV_DIR に展開"
if [[ ! -d "$DEV_DIR/.git" ]]; then
  # worktree 形式: $APP_DIR が "本体"、$DEV_DIR は同じ Git オブジェクトを共有
  git -C "$APP_DIR" worktree add "$DEV_DIR" dev 2>/dev/null || \
    git -C "$APP_DIR" worktree add -B dev "$DEV_DIR" origin/dev
fi
git -C "$DEV_DIR" fetch --all --prune
git -C "$DEV_DIR" reset --hard origin/dev
log "    HEAD: $(git -C "$DEV_DIR" log --oneline -1)"

# -----------------------------------------------------------------------------
# 3. .env を初期化
# -----------------------------------------------------------------------------
log "[3/6] .env を確認"
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  # 強固な乱数で初期値を生成。BOX/Twilio/SMTP/CoNoHa スケーリング系は
  # 利用時にユーザーが手で追記する想定で空欄のまま残す。
  DB_PW="$(openssl rand -hex 16)"
  JWT_P="$(openssl rand -hex 32)"
  JWT_D="$(openssl rand -hex 32)"
  ENC_K="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
# =============================================================================
# GMO ONAiR — 環境変数 (自動生成)
# 生成日時: $(date -Is)
# 必ず必要に応じて手動で値を埋めてから docker compose up すること
# =============================================================================

# --- PostgreSQL ---
DB_PASSWORD=$DB_PW

# --- JWT ---
JWT_SECRET=$JWT_P
JWT_SECRET_DEV=$JWT_D

# --- Encryption Key (v2.8.19+) — liveops 暗号化用 ---
ENCRYPTION_KEY=$ENC_K

# --- マスター管理者 (起動時に system_admin が自動作成される) ---
ADMIN_EMAIL=

# --- SMS (Twilio) — 本番のみ ---
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# --- Email (SMTP) — 本番のみ ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@gmo-onair.jp

# --- CoNoHa VPS スケーリング API (任意) ---
CONOHA_API_USERNAME=
CONOHA_API_PASSWORD=
CONOHA_TENANT_ID=
CONOHA_SERVER_ID=

# --- BOX 連携 (任意) ---
# 1 行に圧縮した JWT 設定 JSON を貼り付け。シングルクォートで囲む。
BOX_CONFIG_JSON=
BOX_PROJECT_PARENT_FOLDER_ID=
BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL=

# --- iCal フィード (任意) ---
ICAL_FEED_TOKEN=
EOF
  chmod 600 "$ENV_FILE"
  log "    新規 .env を生成 (DB/JWT/暗号鍵はランダム値)"
  warn "    BOX / Twilio / SMTP / ADMIN_EMAIL は手動で埋めてください: vim $ENV_FILE"
else
  log "    .env は既に存在 (skip)"
fi

# -----------------------------------------------------------------------------
# 4. docker compose up
# -----------------------------------------------------------------------------
log "[4/6] docker compose build & up"
cd "$APP_DIR"
docker compose pull --ignore-buildable >/dev/null 2>&1 || true
docker compose build --pull
docker compose up -d

# -----------------------------------------------------------------------------
# 5. 起動確認 (app_prod / app_dev の health endpoint を叩く)
# -----------------------------------------------------------------------------
log "[5/6] 起動確認"
wait_health() {
  local name="$1" url="$2" tries=60
  while (( tries-- > 0 )); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      log "    ✓ $name healthy"
      return 0
    fi
    sleep 2
  done
  warn "    ✗ $name 起動確認タイムアウト — docker compose logs $name を確認してください"
  return 1
}
wait_health app_prod http://127.0.0.1:3000/health || true
wait_health app_dev  http://127.0.0.1:3001/health || true

docker compose ps

# -----------------------------------------------------------------------------
# 6. DB バックアップ cron (BOX_CONFIG_JSON が埋まっていれば動く)
# -----------------------------------------------------------------------------
log "[6/6] DB バックアップ cron"
if [[ -x "$APP_DIR/scripts/setup-backup-cron.sh" ]]; then
  bash "$APP_DIR/scripts/setup-backup-cron.sh" || \
    warn "    backup cron 設定に失敗 (BOX_CONFIG_JSON 未設定だと no-op で OK)"
else
  warn "    setup-backup-cron.sh が無い"
fi

cat <<'NEXT'

──────────────────────────────────────────────────────────
deploy 完了。次は以下を確認 → 実行してください:

  1) この VPS の IP を確認:
       curl -s4 https://api.ipify.org && echo

  2) DNS の A レコードを更新:
       gmo-onair.jp      → 新 IP
       www.gmo-onair.jp  → 新 IP
       dev.gmo-onair.jp  → 新 IP
     伝播確認: dig +short gmo-onair.jp

  3) DNS が新 IP を返すようになったら HTTPS を発行:
       bash /root/gmo-onair/scripts/vps/3-issue-cert.sh

  4) (DB を旧 VPS から引き継ぐ場合) BOX バックアップから復元:
       docker exec -it gmo-onair-app_prod-1 \
         node /app/server/scripts/restore-db-from-box.mjs --list
       docker exec -it gmo-onair-app_prod-1 \
         node /app/server/scripts/restore-db-from-box.mjs onair_prod_YYYYMMDD_HHMMSS.sql.gz
──────────────────────────────────────────────────────────
NEXT
