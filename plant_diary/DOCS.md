# Plant Diary

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `language` | `nl` | Interface and notification language (`en` or `nl`). |
| `notify_service` | empty | Notify service for the daily summary, e.g. `notify.mobile_app_phone`. Empty disables push. |
| `notify_hour` | `9` | Hour (0-23) for the daily summary. |

Restart the add-on after changing options.

## MQTT

When the Mosquitto add-on (or another MQTT service) is available, entities are
created automatically through MQTT discovery.

## Backup

Use the menu on the overview page to export or import a JSON backup (including photos).

## Adding a language

Copy `plant_diary/public/locales/nl.json`, translate the values, and add the code to
the `language` option in `config.yaml`.
