#!/usr/bin/env bash
# The federation's view of the node (node/HETZNER.md). Run on the Mac, with
# Nebula running as a member of the test mesh:
#   bin/check-mesh.sh <server-public-ip> [inbox password]
# Tests that a member reaches the node's services over the mesh, and that the
# internet reaches none of them. Kept in node/checks/mesh-<date>.txt.
set -uo pipefail
cd "$(dirname "$0")/.."

PUBLIC="${1:?usage: bin/check-mesh.sh <server-public-ip> [inbox password]}"
INBOX="${2:-}"; PW="${3:-}"
MESH=10.42.0.1
stamp="$(date +%Y-%m-%d-%H%M)"
mkdir -p checks; record="checks/mesh-$stamp.txt"
exec > >(tee "$record") 2>&1

pass=0; fail=0
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
# open <host> <port>: does a TCP connection succeed within 4 seconds?
open() { python3 - "$1" "$2" <<'PY'
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.settimeout(4)
sys.exit(0 if s.connect_ex((sys.argv[1], int(sys.argv[2]))) == 0 else 1)
PY
}

echo "inQbeta node — the federation's view, $stamp"
echo "member: $(hostname)   node: $MESH (mesh), $PUBLIC (public)"
echo

echo "On the mesh"
ping -c 2 -W 2000 "$MESH" >/dev/null 2>&1 || ping -c 2 -W 2 "$MESH" >/dev/null 2>&1 \
  && ok "the node answers on the mesh ($MESH)" || bad "the node answers on the mesh — is Nebula running? sudo nebula -config nebula/member.yml"

h=$(curl -s --max-time 5 "http://$MESH:8080/health")
[[ $h == *healthy* ]] && ok "Dgraph is healthy, reached over the mesh" || bad "Dgraph is healthy, reached over the mesh (got: ${h:0:80})"

t="mesh-$(openssl rand -hex 6)"
curl -s --max-time 8 -H 'Content-Type: application/json' "http://$MESH:8080/mutate?commitNow=true" \
  -d "{\"set\":[{\"dgraph.type\":\"MeshCheck\",\"check.token\":\"$t\"}]}" >/dev/null
out=$(curl -s --max-time 8 -H 'Content-Type: application/dql' "http://$MESH:8080/query" \
  -d '{ q(func: has(check.token)) { check.token } }')
[[ $out == *$t* ]] && ok "a member writes to Dgraph and reads it back" || bad "a member writes to Dgraph and reads it back"

open "$MESH" 1883 && ok "post office (MQTT 1883) answers on the mesh" || bad "post office (MQTT 1883) answers on the mesh"
open "$MESH" 9001 && ok "post office (WebSockets 9001) answers on the mesh" || bad "post office (WebSockets 9001) answers on the mesh"

if [[ -n $INBOX && -n $PW ]] && command -v mosquitto_pub >/dev/null; then
  t="$(openssl rand -hex 8)"
  out=$( (mosquitto_sub -h $MESH -u "$INBOX" -P "$PW" -t "q/in/$INBOX" -q 1 -C 1 -W 8 & sleep 1;
          mosquitto_pub -h $MESH -u "$INBOX" -P "$PW" -t "q/in/$INBOX" -q 1 -m "$t"; wait) 2>&1)
  [[ $out == *$t* ]] && ok "a message goes through the post office over the mesh" || bad "a message goes through the post office over the mesh"
else
  echo "  skip  message round trip (give an inbox and password, and brew install mosquitto)"
fi

echo "Not on the internet"
for p in 1883 9001 8080 9080 5080 7080 8888 9333 8081; do
  open "$PUBLIC" "$p" && bad "port $p is closed on the public address" || ok "port $p is closed on the public address"
done

echo
echo "$pass passed, $fail failed.  Kept in node/$record"
[ "$fail" -eq 0 ]
