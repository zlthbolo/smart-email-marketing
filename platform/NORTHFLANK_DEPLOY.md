# Jareed Soft on Northflank

Production target:

- Northflank free project in `europe-west`
- `Jareed API` combined service, port 3001 public
- `Jareed Worker` combined service, private/no ports
- `Jareed Redis` add-on
- External Neon PostgreSQL through `DATABASE_URL`
- API serves the web UI from the same container
- Runtime encryption/signing secrets are generated inside Northflank

Deployment source:

- Repository: `zlthbolo/smart-email-marketing`
- Branch: `codex/jareed-foundation`
- Template: `platform/northflank.template.json`

Only the database URL is required for the base deployment. Google, Microsoft, and OpenAI credentials are optional until those integrations are enabled.
