#!/usr/bin/env bash
# Route mercury-api subdomain through existing Traefik (n8n Docker stack).
# Run on VPS: bash scripts/setup-mercury-traefik-vps.sh mercury-api.prepservicesfba.com
set -euo pipefail

DOMAIN="${1:-mercury-api.prepservicesfba.com}"
HOST_PORT="${MERCURY_HOST_PORT:-3001}"

TRAEFIK_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i traefik | head -1 || true)"
if [[ -z "${TRAEFIK_CONTAINER}" ]]; then
  echo "Traefik container not found. Is n8n Docker stack running?"
  exit 1
fi

NETWORK="$(docker inspect "${TRAEFIK_CONTAINER}" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | awk '{print $1}')"
GATEWAY="$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo '172.17.0.1')"
TARGET="http://${GATEWAY}:${HOST_PORT}"

# Detect cert resolver name from Traefik command line (Hostinger n8n templates vary).
TRAEFIK_CMD="$(docker inspect "${TRAEFIK_CONTAINER}" --format '{{join .Config.Cmd " "}}')"
CERT_RESOLVER="$(echo "${TRAEFIK_CMD}" | tr ' ' '\n' | grep -E 'certificatesresolvers\.[^.]+\.acme' | head -1 | sed -E 's/.*certificatesresolvers\.([^.]+)\.acme.*/\1/')"
if [[ -z "${CERT_RESOLVER}" ]]; then
  CERT_RESOLVER="mytlschallenge"
fi

echo "Traefik: ${TRAEFIK_CONTAINER}"
echo "Network: ${NETWORK}"
echo "Mercury upstream: ${TARGET}"
echo "Cert resolver: ${CERT_RESOLVER}"
echo "Domain: ${DOMAIN}"

docker rm -f mercury-traefik-router 2>/dev/null || true

docker run -d \
  --name mercury-traefik-router \
  --network "${NETWORK}" \
  --restart unless-stopped \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.mercury-api.rule=Host(\`${DOMAIN}\`)" \
  --label "traefik.http.routers.mercury-api.entrypoints=websecure" \
  --label "traefik.http.routers.mercury-api.tls=true" \
  --label "traefik.http.routers.mercury-api.tls.certresolver=${CERT_RESOLVER}" \
  --label "traefik.http.routers.mercury-api.service=mercury-api" \
  --label "traefik.http.services.mercury-api.loadbalancer.server.url=${TARGET}" \
  --label "traefik.http.routers.mercury-api-http.rule=Host(\`${DOMAIN}\`)" \
  --label "traefik.http.routers.mercury-api-http.entrypoints=web" \
  --label "traefik.http.routers.mercury-api-http.middlewares=mercury-redirect-https" \
  --label "traefik.http.routers.mercury-api-http.service=mercury-api" \
  --label "traefik.http.middlewares.mercury-redirect-https.redirectscheme.scheme=https" \
  --label "traefik.http.middlewares.mercury-redirect-https.redirectscheme.permanent=true" \
  alpine:3.19 \
  sleep infinity

echo "Waiting for Traefik + Let's Encrypt..."
sleep 8

echo "==> HTTPS check"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "https://${DOMAIN}/api/mercury/proxy/invoices" || true
curl -sS "https://${DOMAIN}/api/mercury/proxy/invoices" || true
echo ""
echo "Done. Test in browser: https://${DOMAIN}/api/mercury/proxy/invoices"
