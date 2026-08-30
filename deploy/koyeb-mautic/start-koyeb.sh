#!/usr/bin/env bash
set -euo pipefail

# Koyeb Free cannot run a separate worker service, so keep only the
# essential Mautic maintenance commands in this web container.
(
  while true; do
    php /var/www/html/bin/console mautic:segments:update --no-interaction || true
    sleep 300
    php /var/www/html/bin/console mautic:campaigns:update --no-interaction || true
    sleep 300
    php /var/www/html/bin/console mautic:campaigns:trigger --no-interaction || true
    sleep 300
  done
) &

exec apache2-foreground
