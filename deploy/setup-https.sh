#!/bin/bash
# =============================================
# GMO ONAiR — VPS HTTPS セットアップスクリプト
# CoNoHa VPS で実行してください
# =============================================
set -e

DOMAIN="gmo-onair.jp"
EMAIL="account@gmo-globalstudio.com"

echo "=========================================="
echo "  GMO ONAiR HTTPS Setup"
echo "  Domain: $DOMAIN / dev.$DOMAIN"
echo "=========================================="

# 1. certbot インストール
echo "[1/5] certbot インストール..."
if ! command -v certbot &> /dev/null; then
    apt-get update -qq
    apt-get install -y certbot
    echo "  ✓ certbot installed"
else
    echo "  ✓ certbot already installed"
fi

# 2. Let's Encrypt 用ディレクトリ
mkdir -p /var/www/certbot

# 3. 仮のNginxでACMEチャレンジ対応 (初回のみ)
# Docker が起動する前にスタンドアロンで証明書取得
echo "[2/5] SSL証明書を取得中..."
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # ポート80が空いている必要あり — docker-compose downしておく
    echo "  Docker を一時停止..."
    cd /root/gmo-onair && docker compose down 2>/dev/null || true

    certbot certonly --standalone \
        -d $DOMAIN \
        -d www.$DOMAIN \
        -d dev.$DOMAIN \
        --email $EMAIL \
        --agree-tos \
        --non-interactive

    echo "  ✓ SSL証明書を取得しました"
else
    echo "  ✓ SSL証明書は既に存在します"
    # 更新試行
    certbot renew --dry-run 2>/dev/null && echo "  ✓ 自動更新OK" || echo "  ⚠ 自動更新テスト失敗"
fi

# 4. 自動更新 cron
echo "[3/5] 自動更新 cron 設定..."
CRON_CMD="0 3 * * * certbot renew --quiet --deploy-hook 'docker compose -f /root/gmo-onair/docker-compose.yml exec nginx nginx -s reload'"
(crontab -l 2>/dev/null | grep -v certbot; echo "$CRON_CMD") | crontab -
echo "  ✓ 毎日3:00にcertbot renew実行"

# 5. .env 確認
echo "[4/5] .env 確認..."
cd /root/gmo-onair
if [ ! -f .env ]; then
    echo "  ⚠ .env が存在しません。テンプレートからコピーしてください:"
    echo "    cp .env.example .env"
    echo "    vim .env"
else
    echo "  ✓ .env 存在確認"
fi

# 6. Docker Compose 起動
echo "[5/5] Docker Compose 起動..."
cd /root/gmo-onair
docker compose up -d --build

echo ""
echo "=========================================="
echo "  セットアップ完了!"
echo ""
echo "  本番: https://$DOMAIN"
echo "  開発: https://dev.$DOMAIN"
echo ""
echo "  次のステップ:"
echo "  1. .env に JWT_SECRET, DB_PASSWORD 等を設定"
echo "  2. CoNoHa DNS に A レコードを設定 (@ / dev / www → VPS IP)"
echo "  3. ブラウザで https://$DOMAIN にアクセス"
echo "=========================================="
