#!/bin/sh
set -e

# Segredos via Docker secrets têm precedência sobre variáveis de ambiente.
if [ -f /run/secrets/db_password ]; then
  DB_PASSWORD="$(cat /run/secrets/db_password)"
  export DB_PASSWORD
fi
if [ -f /run/secrets/twitch_oauth_token ]; then
  OAUTH_TOKEN="$(cat /run/secrets/twitch_oauth_token)"
  export OAUTH_TOKEN
fi
# Token fixo da API — é o que roda em produção hoje (secret do Swarm).
if [ -f /run/secrets/twitch_access_token ]; then
  ACCESS_TOKEN="$(cat /run/secrets/twitch_access_token)"
  export ACCESS_TOKEN
fi
if [ -f /run/secrets/twitch_client_secret ]; then
  CLIENT_SECRET="$(cat /run/secrets/twitch_client_secret)"
  export CLIENT_SECRET
fi
if [ -f /run/secrets/twitch_refresh_token ]; then
  TWITCH_REFRESH_TOKEN="$(cat /run/secrets/twitch_refresh_token)"
  export TWITCH_REFRESH_TOKEN
fi

exec "$@"
