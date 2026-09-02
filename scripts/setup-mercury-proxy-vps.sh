#!/usr/bin/env bash
# Run on Hostinger VPS as root (Browser terminal recommended).
# Usage — paste all three lines, edit values in Notepad first, then paste once:
#
#   export MERCURY_API_TOKEN='mercury_production_cma_...'
#   export MERCURY_DESTINATION_ACCOUNT_ID='11f376f8-b3bd-11f0-b084-d3487ee35b77'
#   export MERCURY_PROXY_SECRET='your-long-random-secret'
#   bash /var/www/psf-crm/scripts/setup-mercury-proxy-vps.sh mercury-api.prepservicesfba.com
#
set -euo pipefail

DOMAIN="${1:-mercury-api.prepservicesfba.com}"
APP_DIR="/var/www/psf-crm"
PORT=3001

if [[ -z "${MERCURY_API_TOKEN:-}" || -z "${MERCURY_DESTINATION_ACCOUNT_ID:-}" || -z "${MERCURY_PROXY_SECRET:-}" ]]; then
  echo "Missing env vars. Set MERCURY_API_TOKEN, MERCURY_DESTINATION_ACCOUNT_ID, MERCURY_PROXY_SECRET first."
  exit 1
fi

echo "==> Installing Node.js (if needed)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs git nginx certbot python3-certbot-nginx
fi

echo "==> Updating app at ${APP_DIR}..."
mkdir -p /var/www
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone https://github.com/digitaltechyx/CRM-PrepCorex.git "${APP_DIR}"
fi
cd "${APP_DIR}"
git pull origin main
npm install
npm run build

echo "==> Writing ${APP_DIR}/.env.local ..."
cat > "${APP_DIR}/.env.local" <<EOF
MERCURY_API_TOKEN=${MERCURY_API_TOKEN}
MERCURY_DESTINATION_ACCOUNT_ID=${MERCURY_DESTINATION_ACCOUNT_ID}
MERCURY_PROXY_SECRET=${MERCURY_PROXY_SECRET}
MERCURY_CREDIT_CARD_ENABLED=false
MERCURY_ACH_DEBIT_ENABLED=true
EOF
chmod 600 "${APP_DIR}/.env.local"

echo "==> Starting PM2 on port ${PORT}..."
npm install -g pm2
pm2 delete mercury-proxy 2>/dev/null || true
pm2 start npm --name mercury-proxy -- start
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "==> Configuring nginx for ${DOMAIN}..."
cat > "/etc/nginx/sites-available/mercury-api" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/mercury-api /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

if ! certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m info@prepservicesfba.com || true
fi

echo "==> Local health check..."
sleep 3
curl -sS "http://127.0.0.1:${PORT}/api/mercury/proxy/invoices" || true
echo ""
echo "Done. Open: https://${DOMAIN}/api/mercury/proxy/invoices"
echo "Then set on Vercel:"
echo "  MERCURY_PROXY_URL=https://${DOMAIN}"
echo "  MERCURY_PROXY_SECRET=(same as MERCURY_PROXY_SECRET above)"
