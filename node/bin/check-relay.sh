#!/usr/bin/env bash
# Check the switchboard (node/coturn, the TURN relay): run on the node, after
#   docker compose --profile relay up -d relay
#
# What can be checked from the node itself: that it's running, listens on the
# public address only, refuses a wrong password, and is set to refuse private
# networks and the mesh. Whether calls get through is checked from OUTSIDE,
# from a browser: the last thing this prints is a short-lived username and
# password for that (they expire in ten minutes).
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1"; fail=$((fail+1)); }

[ -n "${TURN_SECRET:-}" ] && ok "TURN_SECRET is set in node/.env" || { bad "TURN_SECRET is set in node/.env"; exit 1; }
HOST="${TURN_PUBLIC_IP:-135.181.156.21}"

docker compose ps relay --status running -q | grep -q . && ok "the switchboard is running" || bad "the switchboard is running"

listening="$(ss -lnu | awk '$4 ~ /:3478$/ {print $4}' | sort -u)"
if [ -n "$listening" ] && ! echo "$listening" | grep -vq "^$HOST:3478$"; then ok "it listens on the public address only ($HOST:3478)"
else bad "it listens on the public address only (found: $(echo $listening))"; fi

user="$(( $(date +%s) + 600 )):check"
cred="$(printf %s "$user" | openssl dgst -sha1 -hmac "$TURN_SECRET" -binary | base64)"
out="$(docker run --rm --network host coturn/coturn:latest turnutils_uclient -y -n 1 -u "$user" -w "not-the-password" "$HOST" 2>&1)"
echo "$out" | grep -qiE "401|unauthori|error" && ok "a wrong password is refused" || bad "a wrong password is refused"

conf=coturn/turnserver.conf
if grep -q '^denied-peer-ip=10.0.0.0-10.255.255.255' $conf && grep -q '^denied-peer-ip=192.168.0.0-192.168.255.255' $conf && grep -q '^no-loopback-peers' $conf
then ok "it's set to refuse private networks and the mesh (10.42.0.0)"; else bad "it's set to refuse private networks and the mesh"; fi

echo; echo "$pass passed, $fail failed"
cat <<MSG

Now the real test, from your own computer (outside the node):
  Open https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
  Remove the Google server, then add:
    URI:       turn:$HOST:3478
    Username:  $user
    Password:  $cred
  Press "Gather candidates". A row of type "relay" with $HOST means calls can
  be connected through this node's switchboard. (This username and password stop working in 10 minutes.)
MSG
[ "$fail" -eq 0 ]
