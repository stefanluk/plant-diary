# Contributing

## Run locally

```bash
cd plant_diary
npm install
npm run dev     # http://localhost:8099, data in ./data
npm test
npx tsc --noEmit
```

Environment variables (the add-on's `run.sh` sets these from the add-on options): `DATA_DIR`, `PORT`, `MQTT_URL`/`MQTT_USER`/`MQTT_PASSWORD`, `NOTIFY_SERVICE`, `NOTIFY_HOUR`, `INGRESS_ONLY` (set to `true` to accept only Supervisor/ingress and loopback requests; the add-on does this).

## Layout

- `plant_diary/src` – Fastify server (`server.ts`), business logic (`service.ts`), SQLite schema/migrations (`db.ts`), name search via GBIF/Wikidata (`names.ts`), MQTT/notification bridge (`ha.ts`).
- `plant_diary/public/index.html` – single-file vanilla JS UI.
- `plant_diary/config.yaml` – add-on manifest; bump `version` to ship an update.

## API

`GET/POST /api/plants`, `GET/PATCH/DELETE /api/plants/:id`, `POST /api/plants/:id/logs` (JSON or multipart with `photo`), `PATCH/DELETE /api/plants/:id/logs/:logId`, `GET/POST /api/species`, `PATCH /api/species/:id`, `GET /api/names/suggest?q=` (local + GBIF/Wikidata), `POST /api/species/resolve` (returns the stored species or creates a name-only one), `GET /api/due`.

## Guidelines

- Database changes must be additive migrations in `db.ts`.
- The Docker image only copies `src`, `public` and `run.sh`, so static data must live in TypeScript modules.
- Never commit secrets (`.env` and `.local/` are git-ignored).
