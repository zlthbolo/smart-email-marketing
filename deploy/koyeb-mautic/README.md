# Mautic on Koyeb Free

This deployment is intended for evaluation/testing on Koyeb Free.

## Koyeb service

- Source: this GitHub repository
- Builder: Dockerfile
- Dockerfile path: `deploy/koyeb-mautic/Dockerfile`
- Instance: Free
- Region: Frankfurt or Washington
- Exposed port: `80`

## Required environment variables

Add these only in Koyeb Secrets/Environment. Never commit real values to GitHub.

- `MAUTIC_DB_HOST`
- `MAUTIC_DB_PORT=3306`
- `MAUTIC_DB_DATABASE`
- `MAUTIC_DB_USER`
- `MAUTIC_DB_PASSWORD`
- `DOCKER_MAUTIC_ROLE=mautic_web`
- `DOCKER_MAUTIC_RUN_MIGRATIONS=true` (first deployment only, then set false)
- `PHP_INI_VALUE_MEMORY_LIMIT=384M`
- `PHP_INI_VALUE_UPLOAD_MAX_FILESIZE=32M`
- `PHP_INI_VALUE_POST_MAX_FILESIZE=32M`

Use an external persistent MySQL/MariaDB database. Koyeb Free local storage is ephemeral and cannot attach a Volume.

## Email transport

Configure the SMTP provider inside Mautic using authenticated submission on port 587/TLS or 465/TLS. Do not use direct outbound port 25 from Koyeb.

Keep lawful outreach controls enabled: clear sender identity, unsubscribe, suppression list, bounce/complaint handling, and conservative sending limits.
