#!/bin/sh
set -e

if [ -f /run/secrets/db_password ]; then
  export DB_PASSWORD="$(cat /run/secrets/db_password)"
fi
if [ -f /run/secrets/twitch_oauth_token ]; then
  export OAUTH_TOKEN="$(cat /run/secrets/twitch_oauth_token)"
fi
if [ -f /run/secrets/twitch_access_token ]; then
  export ACCESS_TOKEN="$(cat /run/secrets/twitch_access_token)"
fi

exec "$@"
