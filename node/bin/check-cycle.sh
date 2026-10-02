#!/usr/bin/env bash
# The full cycle (ADR-Q-014), run on the Mac with Nebula up:
#
#   friend puts a sealed receipt in the STORAGE, then rings the BELLBOY;
#   darren is away; he comes back, the bellboy tells him who and what, he
#   collects it from storage, checks it, opens it — Captured — and custody
#   passes, so the storage lets its copy go.
#
#   bin/check-cycle.sh <darren password> <friend password>
#
# Sealing here is a stand-in: openssl AES with a key only this script holds,
# in place of seal.ts (X25519 to the recipient's key), which Q will use. What
# is tested is the routing: who holds what, for how long, and who can read it.
# Kept in node/checks/cycle-<date>.txt.
set -uo pipefail
cd "$(dirname "$0")/.."

PD="${1:?usage: bin/check-cycle.sh <darren password> <friend password>}"
PF="${2:?usage: bin/check-cycle.sh <darren password> <friend password>}"
MESH=10.42.0.1
STORE="http://$MESH:8888"
stamp="$(date +%Y-%m-%d-%H%M)"
mkdir -p checks; record="checks/cycle-$stamp.txt"
exec > >(tee "$record") 2>&1

pass=0; fail=0
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
KEY="$(openssl rand -hex 32)"                       # stands in for the recipient's key
seal()   { openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:$KEY" -in "$1" -out "$2"; }
unseal() { openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$KEY" -in "$1" -out "$2" 2>/dev/null; }
hash()   { shasum -a 256 "$1" | cut -c1-64; }
SESSION="darren-mac-cycle"

echo "inQbeta node — the full cycle, $stamp"
echo "bellboy: $MESH:1883   storage: $STORE   from: friend   to: darren"
echo

echo "Storage"
st=$(curl -s --max-time 5 "http://$MESH:8888/" -o /dev/null -w '%{http_code}')
[[ $st == 200 || $st == 404 ]] && ok "the storage answers on the mesh" || bad "the storage answers on the mesh (HTTP $st)"

echo "0. Darren has been here before, and is now away"
mosquitto_sub -h $MESH -u darren -P "$PD" -i $SESSION -c -q 1 -t q/in/darren -W 2 >/dev/null 2>&1
ok "darren's bellboy session is registered; darren goes offline"

echo "1. Friend seals a receipt and puts it in the storage"
printf '{"schema":"inqbeta.receipt/test","says":"Meet at the green at six","at":"%s","nonce":"%s"}' \
  "$(date -u +%FT%TZ)" "$(openssl rand -hex 8)" > "$W/receipt.json"
seal "$W/receipt.json" "$W/receipt.sealed"
H=$(hash "$W/receipt.sealed")
put=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' -F "file=@$W/receipt.sealed" "$STORE/holding/$H")
[[ $put == 201 || $put == 200 ]] && ok "sealed receipt stored at holding/${H:0:12}… (HTTP $put)" || bad "sealed receipt stored (HTTP $put)"
grep -q "Meet at the green" "$W/receipt.sealed" && bad "the stored copy is sealed" || ok "the stored copy is sealed — the storage can't read it"

echo "2. Friend rings the bellboy: a notice, sealed, never the receipt"
printf '{"schema":"inqbeta.notice/1","receipt":"%s","from":"friend","title":"Meet at the green","kind":"message","collect":["%s/holding/%s"]}' \
  "$H" "$STORE" "$H" > "$W/notice.json"
seal "$W/notice.json" "$W/notice.sealed"
NOTICE=$(base64 < "$W/notice.sealed" | tr -d '\n')
size=${#NOTICE}
(( size < 1024 )) && ok "the notice is small: $size bytes" || bad "the notice is small (got $size bytes)"
mosquitto_pub -h $MESH -u friend -P "$PF" -q 1 -t q/in/darren -m "$NOTICE" \
  && ok "friend rang darren's bellboy" || bad "friend rang darren's bellboy"
grep -q "Meet at the green" <<<"$NOTICE" && bad "the bellboy can't read who or what" || ok "the bellboy can't read who or what"

echo "3. Darren comes back; the bellboy tells him"
GOT=$(mosquitto_sub -h $MESH -u darren -P "$PD" -i $SESSION -c -q 1 -t q/in/darren -C 1 -W 8 2>/dev/null)
[[ $GOT == "$NOTICE" ]] && ok "the bellboy held the notice while darren was away, and gave it to him" || bad "the bellboy held the notice and gave it to darren"
printf '%s' "$GOT" | base64 -d > "$W/got.sealed" 2>/dev/null
if unseal "$W/got.sealed" "$W/got.json"; then
  from=$(python3 -c 'import json,sys;n=json.load(open(sys.argv[1]));print(n["from"]+" — "+n["title"])' "$W/got.json")
  ok "on darren's device the bell would show: $from"
else
  bad "darren opens the notice on his device"
fi

echo "4. Darren collects the receipt from the storage"
URL=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["collect"][0])' "$W/got.json" 2>/dev/null)
curl -s --max-time 10 -o "$W/collected.sealed" "$URL"
[[ $(hash "$W/collected.sealed") == "$H" ]] && ok "what he collected is exactly what was sent (hash matches)" || bad "the collected copy matches the hash in the notice"
if unseal "$W/collected.sealed" "$W/collected.json" && cmp -s "$W/collected.json" "$W/receipt.json"; then
  ok "Captured: \"$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["says"])' "$W/collected.json")\""
else
  bad "Captured: the receipt opens on darren's device"
fi

echo "5. Custody passes; the storage lets its copy go"
del=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' -X DELETE "$URL")
[[ $del == 204 || $del == 202 || $del == 200 ]] && ok "custody released (HTTP $del)" || bad "custody released (HTTP $del)"
gone=$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$URL")
[[ $gone == 404 ]] && ok "the holding bay is empty again" || bad "the holding bay is empty again (HTTP $gone)"
again=$(mosquitto_sub -h $MESH -u darren -P "$PD" -i $SESSION -c -q 1 -t q/in/darren -C 1 -W 3 2>/dev/null)
[[ -z $again ]] && ok "the notice is spent: the bellboy has nothing more for darren" || bad "the notice is spent"
mosquitto_sub -h $MESH -u darren -P "$PD" -i $SESSION -t q/in/darren -W 1 >/dev/null 2>&1   # clean session: end it

echo
echo "$pass passed, $fail failed.  Kept in node/$record"
[ "$fail" -eq 0 ]
