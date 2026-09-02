#!/bin/bash
set -e
DOMAIN="mercury-api.prepservicesfba.com"
TARGET="http://172.17.0.1:3001"

echo "Removing old router..."
docker rm -f mercury-traefik-router 2>/dev/null || true

echo "Creating Traefik router for ${DOMAIN}..."
docker run -d \
  --name mercury-traefik-router \
  --network root_default \
  --restart unless-stopped \
  --label traefik.enable=true \
  --label traefik.docker.network=root_default \
  --label "traefik.http.routers.mercury-api.rule=Host(\`${DOMAIN}\`)" \
  --label traefik.http.routers.mercury-api.entrypoints=websecure \
  --label traefik.http.routers.mercury-api.tls=true \
  --label traefik.http.routers.mercury-api.tls.certresolver=mytlschallenge \
  --label traefik.http.routers.mercury-api.service=mercury-api \
  --label traefik.http.services.mercury-api.loadbalancer.server.url=${TARGET} \
  alpine:3.19 sleep infinity

echo "Waiting..."
sleep 8

echo "Host rule:"
docker inspect mercury-traefik-router --format '{{index .Config.Labels "traefik.http.routers.mercury-api.rule"}}'

echo "Response:"
curl -sk "https://${DOMAIN}/api/mercury/proxy/invoices"
echo
