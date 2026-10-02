#!/usr/bin/env bash
# Check the relay (node/coturn): run on the node, after
#   docker compose --profile relay up -d relay
#
# Mints a credential the way Q does (lib/server/turn.ts), asks the relay for an
# allocation, and sends test packets through it. Then checks the relay refuses
# a wrong password and refuses to relay into the mesh.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1"; fail=$((fail+1)); }

[ -n "${TURN_SECRET:-}" ] && ok "TURN_SECRET is set in node/.env" || { bad "TURN_SECRET is set in node/.env"; exit 1; }
HOST="${TURN_PUBLIC_IP:-135.181.156.21}"

user="$(( $(date +%s) + 600 )):check"
cred="$(printf %s "$user" | openssl dgst -sha1 -hmac "$TURN_SECRET" -binary | base64)"

uclient() { docker run --rm --network host coturn/coturn:latest turnutils_uclient "$@" 2>&1; }

out="$(uclient -y -n 5 -c -u "$user" -w "$cred" "$HOST")"
echo "$out" | grep -q "Total lost packets 0" && ok "a call's packets go through the relay, none lost" || bad "a call's packets go through the relay ($(echo "$out" | tail -1))"

out="$(uclient -y -n 2 -c -u "$user" -w "not-the-password" "$HOST")"
echo "$out" | grep -qiE "401|unauthori|error" && ok "a wrong password is refused" || bad "a wrong password is refused"

out="$(uclient -n 2 -c -u "$user" -w "$cred" -e 10.42.0.1 "$HOST")"
echo "$out" | grep -qiE "403|forbidden|error" && ok "relaying into the mesh (10.42.0.1) is refused" || bad "relaying into the mesh (10.42.0.1) is refused"

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
