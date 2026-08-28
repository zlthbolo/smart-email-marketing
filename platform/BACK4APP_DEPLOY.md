# Back4App Containers deployment

Use the free single-container plan with the repository root and `platform/Dockerfile.production`.
The production supervisor runs the API and PostgreSQL queue worker together in that container.

Required environment variables:

- `DATABASE_URL`
- `CREDENTIAL_ENCRYPTION_SECRET`
- `WEBHOOK_SIGNING_SECRET`
- `OWNER_EMAIL`
- `OWNER_PASSWORD`

Set `API_PORT` to the platform-provided port when required. The API derives its public URL from
`PUBLIC_API_URL`; set that to the assigned HTTPS domain after the first deployment if the host does
not provide `NF_HOSTS`.
