#!/usr/bin/env bash
# =============================================================================
# GMO ONAiR — VPS bootstrap (system layer)
# =============================================================================
# 新規に契約した CoNoHa VPS (Ubuntu 24.04 / 4GB プラン想定) を、
# Docker + Nginx + UFW + swap + 自動セキュリティ更新まで仕上げる。
#
# 想定実行ユーザー: root
# 想定 OS:          Ubuntu 24.04 LTS (22.04 でも動くはず)
# 冪等性:           何度実行しても壊れない (既に設定済みならスキップ)
#
# 使い方:
#   curl -fsSL https://raw.githubusercontent.com/terai-takehiro/gmo-onair/main/scripts/vps/1-bootstrap.sh | bash
#   # もしくはリポジトリを clone 済みなら:
#   bash /root/gmo-onair/scripts/vps/1-bootstrap.sh
#
# このスクリプトが終わったら次は 2-deploy.sh を実行する。
# =============================================================================
set -euo pipefail

log()  { printf '\033[1;36m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "root で実行してください (sudo bash $0)"

# -----------------------------------------------------------------------------
# 1. 基本パッケージ + ロケール + タイムゾーン
# -----------------------------------------------------------------------------
log "[1/8] apt update + 基本パッケージ"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  git vim nano htop tmux jq unzip rsync \
  ufw fail2ban unattended-upgrades \
  locales tzdata logrotate

log "[2/8] ロケール / タイムゾーン"
locale-gen en_US.UTF-8 ja_JP.UTF-8 C.UTF-8 >/dev/null
update-locale LANG=C.UTF-8 LC_ALL=C.UTF-8
timedatectl set-timezone Asia/Tokyo

# -----------------------------------------------------------------------------
# 2. swap (4GB プラン: 物理 4GB → swap 4GB が無難)
# -----------------------------------------------------------------------------
log "[3/8] swap 確認 (4GB)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  log "    swap 4G を有効化"
else
  log "    swap は既に存在 (skip)"
fi

# -----------------------------------------------------------------------------
# 3. Docker + Compose plugin
# -----------------------------------------------------------------------------
log "[4/8] Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  log "    Docker $(docker --version) インストール完了"
else
  log "    Docker は既にインストール済 ($(docker --version | awk '{print $3}' | tr -d ,))"
fi

# Docker のログサイズ上限 (本番でログが膨らんで /var が満杯になる事故対策)
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
JSON
  systemctl restart docker
  log "    /etc/docker/daemon.json でログローテーション設定"
fi

# -----------------------------------------------------------------------------
# 4. UFW (ファイアウォール)
# -----------------------------------------------------------------------------
log "[5/8] UFW (22/80/443 のみ許可)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
# CoNoHa の管理コンソールは VNC 経由なので別ポート不要
ufw --force enable >/dev/null
ufw status numbered | sed 's/^/    /'

# -----------------------------------------------------------------------------
# 5. fail2ban (SSH ブルートフォース対策)
# -----------------------------------------------------------------------------
log "[6/8] fail2ban"
cat > /etc/fail2ban/jail.d/sshd.local <<'INI'
[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 5
findtime = 10m
bantime  = 1h
INI
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

# -----------------------------------------------------------------------------
# 6. unattended-upgrades (セキュリティ自動適用)
# -----------------------------------------------------------------------------
log "[7/8] unattended-upgrades (security)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
# デフォルトの 50unattended-upgrades は security 系のみ ON。kernel 更新で
# 自動再起動が走らないよう Automatic-Reboot は false のまま据置。

# -----------------------------------------------------------------------------
# 7. 健全性メモ
# -----------------------------------------------------------------------------
log "[8/8] 健全性"
log "    Docker:       $(docker --version)"
log "    Compose:      $(docker compose version | head -1)"
log "    Disk free:    $(df -h / | awk 'NR==2 {print $4 " / " $2}')"
log "    Memory:       $(free -h | awk '/^Mem:/ {print $7 " avail / " $2 " total"}')"
log "    Swap:         $(free -h | awk '/^Swap:/ {print $2}')"
log "    Public IP:    $(curl -s4 https://api.ipify.org 2>/dev/null || echo '(unknown)')"

cat <<'NEXT'

──────────────────────────────────────────────────────────
bootstrap 完了。次は以下を実行してください:

  bash /root/gmo-onair/scripts/vps/2-deploy.sh
  # ↑ リポジトリ未 clone の場合はまず:
  #   cd /root && git clone https://github.com/terai-takehiro/gmo-onair.git
  #   cd /root/gmo-onair && git checkout main
──────────────────────────────────────────────────────────
NEXT
