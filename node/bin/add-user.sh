#!/usr/bin/env bash
# Add (or reset) an inbox on the post office and print its password once.
# Day one only: later, Q signs in with its DID (ADR-Q-010 §5) and this goes.
set -euo pipefail
cd "$(dirname "$0")/.."

id="${1:?usage: bin/add-user.sh <inbox-id>   (lowercase letters, digits, hyphens)}"
[[ "$id" =~ ^[a-z0-9-]{3,64}$ ]] || { echo "Inbox id must be 3-64 lowercase letters, digits or hyphens." >&2; exit 1; }
pw="$(openssl rand -hex 16)"
F=/mosquitto/config/passwd

docker compose run --rm --no-deps -T mosquitto sh -c "
  if [ -s $F ]; then mosquitto_passwd -b $F '$id' '$pw'; else mosquitto_passwd -c -b $F '$id' '$pw'; fi
  chown mosquitto:mosquitto $F && chmod 0600 $F"

# Tell a running broker to reload its password file and ACL.
docker compose kill -s HUP mosquitto >/dev/null 2>&1 || true

echo "inbox:    $id"
echo "password: $pw"
echo "Keep this somewhere safe (it is not shown again)."
