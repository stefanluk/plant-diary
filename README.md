# Plant Diary (Plantendagboek)

A Home Assistant add-on to keep track of your houseplants: a watering schedule per species (summer/winter adjusts automatically), a diary with water/feed/repot/prune/notes, a photo per plant, light and toxicity info, push reminders and MQTT sensors in Home Assistant.

> 🇳🇱 **Samenvatting:** een Home Assistant add-on om kamerplanten bij te houden (waterschema, dagboek, foto per plant, standplaats, giftigheid, push-herinneringen en sensoren). Installatie: zie hieronder. De interface is in het Nederlands.

## Features

- Plant list with the next watering date; the "water given" button only shows when watering is due.
- Species autocomplete while adding a plant: scientific names from [GBIF](https://www.gbif.org/) and Dutch/English names from [Wikidata](https://www.wikidata.org/) (no key needed). There is no built-in catalog.
- Fixed light levels (full shade, half shade, indirect light, full sun) and soil types; a warning when a plant stands outside its species' light range.
- Diary entries with date and note; entries can be edited or deleted.
- Care data (watering days, light range, soil, toxicity, tips) is entered once per species via "Bewerk soort" and then reused by every plant of that species. No paid or keyed API is needed.
- Push reminders with a **Water given** action, and sensors/buttons through MQTT discovery.
- Runs only behind Home Assistant ingress (sidebar panel); no extra port is exposed.

## Installation

1. In Home Assistant: **Settings → Add-ons → Add-on store → ⋮ → Repositories**, add `https://github.com/stefanluk/plant-diary`.
2. Install **Plantendagboek**, then open its **Configuration** tab (see options below) and start it.
3. Open it from the sidebar.

### Optional: sensors and buttons (MQTT)

Install the **Mosquitto broker** add-on and add the **MQTT** integration. Plant Diary detects the broker automatically and creates, per plant, a "next watering" sensor and a "water given" button, plus a summary sensor `Planten water nodig`. A sample dashboard card is in [`docs/lovelace.yaml`](docs/lovelace.yaml).

### Optional: push reminders

Set `notify_service` to your phone's notify service, e.g. `notify.mobile_app_<your_phone>` (find it under **Developer tools → Actions**). Each plant that needs water triggers one notification per day from `notify_hour`, with a **Water given** action. Leave it empty to disable reminders.

## Options

| Option | Description |
|---|---|
| `notify_service` | Notify service for push reminders. Empty = off. |
| `notify_hour` | Hour (0–23) from which reminders are sent. |

## Schedule logic

Next watering = last watered + interval. The interval is the plant's own override, otherwise the species' interval (summer Apr–Sep, winter Oct–Mar). A manually set next date applies until the plant is watered again. Logging a back-dated entry never moves "last watered" backwards.

## Data and privacy

Data (SQLite database and photos) is stored in the add-on's config folder and included in Home Assistant backups. External services: GBIF and Wikidata, only for the species autocomplete (the text you type is sent). Nothing else leaves your Home Assistant.

## Disclaimer

Species names come from GBIF and Wikidata; care data is whatever you enter. Care tips and especially **toxicity information are indicative only** and not veterinary or medical advice. Check a reliable source (e.g. your vet or a poison control centre) for plants that pets or children can reach. You can correct any species through "Bewerk soort".

## Security

- The web UI and API have no login of their own: access is limited to Home Assistant ingress (requests from the Supervisor), so Home Assistant's authentication applies. Do not publish the add-on's port.
- Uploads are limited to images (checked by file signature) and stored with random names.
- Responses carry a Content-Security-Policy and other hardening headers.

Found a vulnerability? Please open a private security advisory on GitHub instead of a public issue.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
