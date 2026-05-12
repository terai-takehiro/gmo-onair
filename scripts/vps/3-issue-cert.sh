#!/usr/bin/env bash
# =============================================================================
# GMO ONAiR — Let's Encrypt 初回発行 + 自動更新セットアップ
# =============================================================================
# 2-deploy.sh の後、DNS が新 VPS の IP を返すようになってから実行する。
#
# 手順:
#   1. Docker Compose の nginx だけ一時停止 (host:80 を空ける)
#   2. certbot standalone で gmo-onair.jp / www / dev 3 ドメインの cert 取得
#   3. nginx を再起動 (HTTPS が有効になる)
#   4. cron で毎日 03:00 に renew を試行 (--deploy-hook で nginx -s reload)
#
# 想定実行ユーザー: root
# 冪等性:           発行済なら renew --dry-run のみ実行
# =============================================================================
set -euo pipefail

DOMAIN_ROOT="${DOMAIN_ROOT:-gmo-onair.jp}"
DOMAINS=("$DOMAIN_ROOT" "www.$DOMAIN_ROOT" "dev.$DOMAIN_ROOT")
EMAIL="${LETSENCRYPT_EMAIL:-account@gmo-globalstudio.com}"
APP_DIR="${APP_DIR:-/root/gmo-onair}"

log()  { printf '\033[1;36m[cert]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[cert]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[cert]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "root で実行してください"

# -----------------------------------------------------------------------------
# 0. DNS 確認 (誤発行と「rate limit 5/week」を防ぐ)
# -----------------------------------------------------------------------------
log "[0/4] DNS 確認"
MY_IP="$(curl -fsS4 https://api.ipify.org 2>/dev/null || true)"
[[ -n "$MY_IP" ]] || die "公開 IP の取得に失敗"
log "    この VPS の公開 IP: $MY_IP"

for d in "${DOMAINS[@]}"; do
  RESOLVED="$(dig +short A "$d" @1.1.1.1 | tail -1)"
  if [[ "$RESOLVED" == "$MY_IP" ]]; then
    log "    ✓ $d → $RESOLVED"
  else
    warn "    ✗ $d は $RESOLVED を返しています (期待値: $MY_IP)"
    warn "      DNS が伝播するまで待ってから再実行してください"
    DNS_FAIL=1
  fi
done
if [[ "${DNS_FAIL:-0}" == "1" ]]; then
  read -rp "DNS が一部不一致ですが続行しますか? [y/N]: " ans
  [[ "$ans" =~ ^[yY] ]] || die "中断"
fi

# -----------------------------------------------------------------------------
# 1. certbot
# -----------------------------------------------------------------------------
log "[1/4] certbot インストール"
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq certbot
fi
log "    certbot $(certbot --version 2>&1)"

mkdir -p /var/www/certbot

# -----------------------------------------------------------------------------
# 2. nginx を一時停止 (compose の nginx だけ。app/db は触らない)
# -----------------------------------------------------------------------------
log "[2/4] nginx を一時停止 (compose の他コンテナはそのまま)"
cd "$APP_DIR"
docker compose stop nginx 2>/dev/null || true
# 念のため OS 側 nginx も止める (誤って apt install nginx されていた場合)
systemctl stop nginx 2>/dev/null || true

# -----------------------------------------------------------------------------
# 3. cert 発行 or 更新
# -----------------------------------------------------------------------------
log "[3/4] Let's Encrypt 証明書"
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN_ROOT" ]]; then
  certbot certonly --standalone \
    $(printf -- "-d %s " "${DOMAINS[@]}") \
    --email "$EMAIL" --agree-tos --non-interactive --no-eff-email
  log "    ✓ 新規発行完了"
else
  log "    既に発行済 — renew --dry-run でテスト"
  certbot renew --dry-run
fi

# -----------------------------------------------------------------------------
# 4. nginx を再起動 + 自動更新 cron
# -----------------------------------------------------------------------------
log "[4/4] nginx 再起動 + 自動更新 cron"
docker compose up -d nginx

RENEW_CMD="0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f $APP_DIR/docker-compose.yml exec -T nginx nginx -s reload'"
( crontab -l 2>/dev/null | grep -v 'certbot renew' ; echo "$RENEW_CMD" ) | crontab -
log "    cron 登録: $RENEW_CMD"

cat <<NEXT

──────────────────────────────────────────────────────────
HTTPS セットアップ完了。

  本番: https://$DOMAIN_ROOT
  開発: https://dev.$DOMAIN_ROOT

確認:
  curl -sk https://$DOMAIN_ROOT/health
  curl -sk https://dev.$DOMAIN_ROOT/health

cron 確認:
  crontab -l | grep certbot

(任意) 旧 VPS の DB を復元する場合:
  docker exec -it gmo-onair-app_prod-1 \\
    node /app/server/scripts/restore-db-from-box.mjs --list
──────────────────────────────────────────────────────────
NEXT
