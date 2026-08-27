#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
SECRETS_DIR=/root/postal-secrets
DB_PASSWORD_FILE="${SECRETS_DIR}/mariadb-root-password"

apt-get update
apt-get install -y ca-certificates curl git jq openssl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

docker --version
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi

mkdir -p /opt/postal
if [[ ! -d /opt/postal/install/.git ]]; then
  git clone https://github.com/postalserver/install /opt/postal/install
else
  git -C /opt/postal/install pull --ff-only origin main
fi
ln -sfn /opt/postal/install/bin/postal /usr/bin/postal

install -d -m 700 "${SECRETS_DIR}"
if [[ -n "${POSTAL_DB_PASSWORD:-}" ]]; then
  DB_PASSWORD="${POSTAL_DB_PASSWORD}"
elif [[ -s "${DB_PASSWORD_FILE}" ]]; then
  DB_PASSWORD="$(cat "${DB_PASSWORD_FILE}")"
else
  DB_PASSWORD="$(openssl rand -hex 24)"
fi
printf '%s\n' "${DB_PASSWORD}" > "${DB_PASSWORD_FILE}"
chmod 600 "${DB_PASSWORD_FILE}"

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

DB_READY=0
for _ in {1..60}; do
  if docker exec postal-mariadb mariadb-admin ping -uroot -p"${DB_PASSWORD}" --silent >/dev/null 2>&1; then
    DB_READY=1
    break
  fi
  sleep 2
done
if [[ "${DB_READY}" -ne 1 ]]; then
  echo "MariaDB did not become ready. Check: docker logs postal-mariadb"
  exit 1
fi

if [[ -z "${POSTAL_HOSTNAME:-}" ]]; then
  echo
  echo "Postal prerequisites are ready."
  echo "Waiting only for POSTAL_HOSTNAME (example: postal.example.com)."
  echo "MariaDB password is stored root-only at ${DB_PASSWORD_FILE}"
  exit 0
fi

postal bootstrap "${POSTAL_HOSTNAME}"

# Postal v3 bootstrap starts with 'password: postal' in main_db and message_db.
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
