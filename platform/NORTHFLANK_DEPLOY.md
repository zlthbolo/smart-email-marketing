# Jareed Soft on Northflank

Production target:

- Northflank free project in `europe-west`
- `Jareed API` combined service, port 3001 public
- `Jareed Worker` combined service, private/no ports
- PostgreSQL-backed queue on the existing Neon database (no paid Redis add-on)
- External Neon PostgreSQL through `DATABASE_URL`
- API serves the web UI from the same container
- Runtime encryption/signing secrets are generated inside Northflank

Deployment source:

- Repository: `zlthbolo/smart-email-marketing`
- Branch: `main`
- Template: `platform/northflank.template.json`

Only the database URL is required for the base deployment. Google, Microsoft, and OpenAI credentials are optional until those integrations are enabled.
