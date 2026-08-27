#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git jq openssl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

docker --version
docker compose version

mkdir -p /opt/postal
if [[ ! -d /opt/postal/install/.git ]]; then
  git clone https://github.com/postalserver/install /opt/postal/install
else
  git -C /opt/postal/install pull --ff-only origin main
fi

ln -sfn /opt/postal/install/bin/postal /usr/bin/postal

if [[ -n "${POSTAL_DB_PASSWORD:-}" ]]; then
  DB_PASSWORD="${POSTAL_DB_PASSWORD}"
else
  DB_PASSWORD="$(openssl rand -hex 24)"
fi

install -d -m 700 /root/postal-secrets
printf '%s\n' "${DB_PASSWORD}" > /root/postal-secrets/mariadb-root-password
chmod 600 /root/postal-secrets/mariadb-root-password

if docker ps -a --format '{{.Names}}' | grep -qx 'postal-mariadb'; then
  docker start postal-mariadb >/dev/null || true
else
  docker run -d \
    --name postal-mariadb \
    -p 127.0.0.1:3306:3306 \
    --restart always \
    -e MARIADB_DATABASE=postal \
    -e MARIADB_ROOT_PASSWORD="${DB_PASSWORD}" \
    mariadb:11.4
fi

for i in {1..60}; do
  if docker exec postal-mariadb mariadb-admin ping -uroot -p"${DB_PASSWORD}" --silent >/dev/null 2>&1; then
    break
  fi
  sleep 2
docker inspect postal-mariadb >/dev/null
done

if [[ -z "${POSTAL_HOSTNAME:-}" ]]; then
  echo
  echo "Postal prerequisites are ready."
  echo "Waiting only for POSTAL_HOSTNAME (for example: postal.example.com)."
  echo "MariaDB password is stored root-only at /root/postal-secrets/mariadb-root-password"
  exit 0
fi

postal bootstrap "${POSTAL_HOSTNAME}"

# Postal v3 bootstrap uses the placeholder password 'postal' for both DB sections.
sed -i "s/password: postal/password: ${DB_PASSWORD}/g" /opt/postal/config/postal.yml

postal initialize
postal start

if ! docker ps -a --format '{{.Names}}' | grep -qx 'postal-caddy'; then
  docker run -d \
    --name postal-caddy \
    --restart always \
    --network host \
    -v /opt/postal/config/Caddyfile:/etc/caddy/Caddyfile \
    -v /opt/postal/caddy-data:/data \
    caddy
else
  docker restart postal-caddy >/dev/null
fi

postal status

echo
printf 'Postal web hostname: https://%s\n' "${POSTAL_HOSTNAME}"
echo "Next: create the first admin user with: postal make-user"
echo "Then configure DNS + PTR/rDNS and verify outbound TCP/25."
