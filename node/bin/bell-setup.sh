#!/usr/bin/env bash
# Turn the bell on in Q (dev), for the Hetzner test node (ADR-Q-014).
#   bin/bell-setup.sh <darren's inbox password>
# Writes the PUBLIC_BELLBOY_* lines into apps/q/.env.local (git-ignored),
# keeping anything else there and keeping the test key if one exists.
# Then restart `pnpm dev` so Q reads them.
set -euo pipefail
cd "$(dirname "$0")/../.."
PW="${1:?usage: node/bin/bell-setup.sh <darren password>}"
F=apps/q/.env.local
touch "$F"
KEY=$(grep -E '^PUBLIC_BELLBOY_KEY=' "$F" | cut -d= -f2 || true)
[[ $KEY =~ ^[0-9a-f]{64}$ ]] || KEY=$(openssl rand -hex 32)
grep -v '^PUBLIC_BELLBOY_' "$F" > "$F.tmp" || true
cat >> "$F.tmp" <<CONF
# The bell (ADR-Q-014) — dev stand-ins: an inbox password instead of your DID,
# and a shared test key instead of seal.ts. Test values only; never real ones.
PUBLIC_BELLBOY_URL=ws://10.42.0.1:9001
PUBLIC_BELLBOY_INBOX=darren
PUBLIC_BELLBOY_PASSWORD=$PW
PUBLIC_BELLBOY_KEY=$KEY
CONF
mv "$F.tmp" "$F"
echo "Bell settings written to $F. Restart pnpm dev, then: node node/bin/ring.mjs <friend password>"
