#!/usr/bin/env bash
# Cài SmartOffice + Cloudflare Tunnel trên Ubuntu/Debian. Chạy: sudo bash deploy/linux/install.sh <CLOUDFLARE_TUNNEL_TOKEN>
set -euo pipefail
TOKEN="${1:-}"
[ -z "$TOKEN" ] && { echo "Thiếu mã token tunnel. Cách dùng: sudo bash install.sh <TOKEN>"; exit 1; }
SRC="$(cd "$(dirname "$0")/../.." && pwd)"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
id smartoffice >/dev/null 2>&1 || useradd --system --home /opt/smartoffice --shell /usr/sbin/nologin smartoffice
mkdir -p /opt/smartoffice /var/lib/smartoffice
cp -r "$SRC"/{server.js,db.js,hr2.js,biz.js,ext.js,package.json,public} /opt/smartoffice/
chown -R smartoffice:smartoffice /opt/smartoffice /var/lib/smartoffice
cp "$SRC/deploy/linux/smartoffice.service" /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now smartoffice

if ! command -v cloudflared >/dev/null; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update && apt-get install -y cloudflared
fi
cloudflared service install "$TOKEN"
sleep 3
curl -fsS http://localhost:3000/healthz && echo " – SmartOffice đang chạy, Cloudflare Tunnel đã cài."
