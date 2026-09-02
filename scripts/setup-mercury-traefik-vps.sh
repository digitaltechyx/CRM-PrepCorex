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

NETWORK="$(docker inspect "${TRAEFIK_CONTAINER}" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')"
GATEWAY="$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo '172.17.0.1')"
TARGET="http://${GATEWAY}:${HOST_PORT}"

TRAEFIK_CMD="$(docker inspect "${TRAEFIK_CONTAINER}" --format '{{join .Config.Cmd " "}}')"
CERT_RESOLVER="$(echo "${TRAEFIK_CMD}" | tr ' ' '\n' | grep -E 'certificatesresolvers\.[^.]+\.acme' | head -1 | sed -E 's/.*certificatesresolvers\.([^.]+)\.acme.*/\1/')"

# Prefer cert resolver copied from the working n8n router labels.
N8N_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i n8n | head -1 || true)"
if [[ -n "${N8N_CONTAINER}" ]]; then
  N8N_RESOLVER="$(docker inspect "${N8N_CONTAINER}" --format '{{json .Config.Labels}}' \
    | grep -oE '"traefik\.http\.routers\.[^"]+\.tls\.certresolver":"[^"]+"' \
    | head -1 \
    | sed -E 's/.*:"([^"]+)"/\1/' || true)"
  if [[ -n "${N8N_RESOLVER}" ]]; then
    CERT_RESOLVER="${N8N_RESOLVER}"
  fi
fi

if [[ -z "${CERT_RESOLVER}" ]]; then
  CERT_RESOLVER="mytlschallenge"
fi

# Traefik may be scoped to one Docker network (common on Hostinger n8n templates).
DOCKER_NETWORK="$(echo "${TRAEFIK_CMD}" | tr ' ' '\n' | grep -E '^--providers\.docker\.network=' | head -1 | cut -d= -f2- || true)"
if [[ -z "${DOCKER_NETWORK}" ]]; then
  DOCKER_NETWORK="${NETWORK}"
fi

echo "Traefik: ${TRAEFIK_CONTAINER}"
echo "Network: ${NETWORK}"
echo "Traefik docker network label: ${DOCKER_NETWORK}"
echo "Mercury upstream: ${TARGET}"
echo "Cert resolver: ${CERT_RESOLVER}"
echo "Domain: ${DOMAIN}"

docker rm -f mercury-traefik-router 2>/dev/null || true

# Match Hostinger n8n pattern: HTTPS router on websecure only.
# Do NOT add a separate HTTP redirect router — Traefik already redirects web -> websecure globally.
docker run -d \
  --name mercury-traefik-router \
  --network "${NETWORK}" \
  --restart unless-stopped \
  --label "traefik.enable=true" \
  --label "traefik.docker.network=${DOCKER_NETWORK}" \
  --label "traefik.http.routers.mercury-api.rule=Host(\`${DOMAIN}\`)" \
  --label "traefik.http.routers.mercury-api.entrypoints=websecure" \
  --label "traefik.http.routers.mercury-api.tls=true" \
  --label "traefik.http.routers.mercury-api.tls.certresolver=${CERT_RESOLVER}" \
  --label "traefik.http.routers.mercury-api.service=mercury-api" \
  --label "traefik.http.services.mercury-api.loadbalancer.server.url=${TARGET}" \
  alpine:3.19 \
  sleep infinity

echo "Waiting for Traefik to pick up router..."
sleep 5

echo "==> Routing check (must return JSON, not 404)..."
for i in $(seq 1 12); do
  BODY="$(curl -skS "https://${DOMAIN}/api/mercury/proxy/invoices" 2>/dev/null || true)"
  if echo "${BODY}" | grep -q '"mercuryConfigured"'; then
    echo "OK: routing works"
    echo "${BODY}"
    break
  fi
  echo "  attempt ${i}/12 — still 404 or unreachable"
  sleep 3
done

if ! echo "${BODY}" | grep -q '"mercuryConfigured"'; then
  echo "ERROR: Traefik is not routing ${DOMAIN} to port ${HOST_PORT}."
  docker logs "${TRAEFIK_CONTAINER}" 2>&1 | grep -iE 'mercury|error' | tail -10 || true
  exit 1
fi

echo ""
echo "==> Certificate check..."
ISSUER="$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
  | openssl x509 -noout -issuer 2>/dev/null || true)"
if echo "${ISSUER}" | grep -qiE 'lets encrypt|letsencrypt|R3|YR1|E[0-9]'; then
  echo "OK: ${ISSUER}"
  echo "Done: https://${DOMAIN}/api/mercury/proxy/invoices"
  exit 0
fi

echo "Routing OK but cert not Let's Encrypt yet (${ISSUER:-unknown}). Restarting Traefik once..."
docker restart "${TRAEFIK_CONTAINER}" >/dev/null
sleep 15

for i in $(seq 1 12); do
  ISSUER="$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
    | openssl x509 -noout -issuer 2>/dev/null || true)"
  if echo "${ISSUER}" | grep -qiE 'lets encrypt|letsencrypt|R3|YR1|E[0-9]'; then
    echo "OK: ${ISSUER}"
    echo "Done: https://${DOMAIN}/api/mercury/proxy/invoices"
    exit 0
  fi
  echo "  cert attempt ${i}/12 — ${ISSUER:-no cert yet}"
  sleep 5
done

echo ""
echo "WARNING: Let's Encrypt cert not detected yet."
echo "Recent Traefik ACME log lines:"
docker logs "${TRAEFIK_CONTAINER}" 2>&1 | grep -iE 'mercury|acme|certificate|error' | tail -20 || true
echo ""
echo "Proxy still works; fix DNS/ACME then re-run:"
echo "  bash scripts/fix-mercury-traefik-ssl-vps.sh ${DOMAIN}"
exit 1
