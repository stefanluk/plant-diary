#!/usr/bin/with-contenv bashio
# Maps add-on options and the HA MQTT service to the environment variables the app expects.
export DATA_DIR=/config
export PORT=8099
export NOTIFY_SERVICE="$(bashio::config 'notify_service')"
export NOTIFY_HOUR="$(bashio::config 'notify_hour')"
export INGRESS_ONLY=true
if bashio::services.available mqtt; then
  export MQTT_URL="mqtt://$(bashio::services mqtt host):$(bashio::services mqtt port)"
  export MQTT_USER="$(bashio::services mqtt username)"
  export MQTT_PASSWORD="$(bashio::services mqtt password)"
fi
cd /app && exec node dist/server.js
