#!/usr/bin/env bash
# Diagnose + fix Traefik/Let's Encrypt for mercury-api on Hostinger n8n VPS.
# Usage: bash scripts/fix-mercury-traefik-ssl-vps.sh mercury-api.prepservicesfba.com
set -euo pipefail

DOMAIN="${1:-mercury-api.prepservicesfba.com}"

echo "==> DNS"
dig +short "${DOMAIN}" A || true
echo ""

TRAEFIK_CONTAINER="$(docker ps --format '{{.Names}}' | grep -i traefik | head -1 || true)"
if [[ -z "${TRAEFIK_CONTAINER}" ]]; then
  echo "Traefik container not found."
  exit 1
fi

echo "==> Traefik ACME config"
docker inspect "${TRAEFIK_CONTAINER}" --format '{{join .Config.Cmd "\n"}}' \
  | grep -iE 'certificatesresolvers|acme|entrypoints\.web' || true
echo ""

echo "==> mercury-traefik-router labels"
docker inspect mercury-traefik-router --format '{{json .Config.Labels}}' 2>/dev/null || echo "(container missing — run setup-mercury-traefik-vps.sh first)"
echo ""

echo "==> Current certificate issuer"
echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "(could not read cert)"
echo ""

echo "==> Re-applying Traefik router + restart"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${SCRIPT_DIR}/setup-mercury-traefik-vps.sh" "${DOMAIN}"
