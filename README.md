# Plant Diary (Plantendagboek)

Home Assistant add-on (Node/TypeScript, SQLite) om kamerplanten bij te houden: waterschema per soort (zomer/winter automatisch, per plant overschrijfbaar), dagboek met water/voeding/verpotten/snoeien/notities/foto's en een "werkt/werkt niet"-vlag, giftig-labels voor kat en kind, push-herinneringen en sensoren in HA.

## Lokaal draaien

```bash
cd plant_diary
npm install
npm run dev          # http://localhost:8099, data in ./data
npm test
```

## Pushen met token uit `.env`

1. `cp .env.example .env` en vul `PUSH_TOKEN` in (fine-grained token van `stefanluk`, alleen deze repo, Contents: Read and write). `.env` staat in `.gitignore`.
2. Gebruik `scripts/gitx` in plaats van `git` voor commando's die de remote raken: `scripts/gitx push`, `scripts/gitx pull`. Dit gebruikt het token uit `.env` en negeert andere ingelogde accounts (bijv. `gh`).
3. Gewone `git` in een eigen terminal werkt ook: de repo heeft een lokale credential helper (`scripts/git-credential-env.sh`) voor github.com. Na een verse clone: `git config --local credential.https://github.com.helper '!sh scripts/git-credential-env.sh'`.

Env: `DATA_DIR`, `PORT`, `SEED` (starterplanten bij lege database, standaard `true`), `MQTT_URL`/`MQTT_USER`/`MQTT_PASSWORD`, `NOTIFY_SERVICE` (bijv. `notify.mobile_app_pixel`), `NOTIFY_HOUR`.

## Installeren in Home Assistant

1. Add-on store → ⋮ → Repositories → voeg `https://github.com/stefanluk/plant-diary` toe, installeer "Plantendagboek".
2. Zet in de add-on-opties `notify_service` op je telefoon, bijv. `notify.mobile_app_<telefoon>`.
3. Installeer de Mosquitto-add-on en de MQTT-integratie voor sensoren. De add-on pakt de broker automatisch op.
4. Start en open via "Plantendagboek" in de zijbalk (ingress).

## In HA

- Per plant: `sensor.<plant>_volgende_water` (datum) en `button.<plant>_water_gegeven`.
- `sensor.planten_water_nodig`: aantal planten dat water nodig heeft, met lijst in attributen.
- Push: dagelijks vanaf `notify_hour` per plant die water nodig heeft, met actie **Water gegeven**. Die zet "laatst water" op vandaag en herberekent de volgende datum.
- Dashboard: zie `docs/lovelace.yaml`.

## Schema

Volgende water = laatste water + interval. Interval: plantoverschrijving > soort (zomer apr–sep, winter okt–mrt). Een handmatig gezette volgende datum geldt tot de plant weer water krijgt. Met een datum in het verleden loggen verschuift "laatst water" niet terug.

## Soorten (0.3.0)

- Bij "+ Plant" zoek je lokaal (Latijn/NL/EN/synoniemen, max. 6 suggesties) in een startcatalogus van ± 100 kamerplanten. De catalogus is uit algemene kennis samengesteld en staat als **concept** (niet gecontroleerd); controleer en pas aan via "Bewerk soort" en vink "gecontroleerd" aan. Bewerkte soorten worden nooit overschreven door een catalogusupdate.
- "Zoek online" gebruikt Perenual (optie `perenual_api_key`, gratis tier: 100 calls/dag, alleen soorten met id ≤ 3000). Alleen bij een klik, resultaten worden gecachet en lokaal opgeslagen.
- Vaste opties: licht (volledige schaduw, halfschaduw, indirect licht, vol zonlicht) en grond (cactus/succulent, doorlatend, standaard, vochtig/humusrijk, orchideeënbast). Staat een plant buiten het lichtbereik van de soort, dan volgt een waarschuwing.

## API

`GET/POST /api/plants`, `GET/PATCH /api/plants/:id`, `POST /api/plants/:id/logs` (JSON of multipart met `photo`), `DELETE /api/plants/:id/logs/:logId`, `GET/POST/PATCH /api/species`, `GET /api/species/search?q=`, `POST /api/species/search-online` en `/api/species/from-online` (Perenual), `GET /api/config`, `GET /api/due`.

## Later

Bodemvochtsensoren, meerdere gebruikers (HA-gebruiker uit ingress-headers).
