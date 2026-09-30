#!/usr/bin/env bash
# Audit the post office (ADR-Q-010): tests every must and cannot in
# mosquitto.conf and acl against the running broker. Safe to run any time:
# it adds two throwaway inboxes, tests, then removes them and their sessions.
# Each run is kept in node/checks/<date>.txt — what was measured goes in a
# file, not in anyone's head.
set -uo pipefail
cd "$(dirname "$0")/.."

stamp="$(date +%Y-%m-%d-%H%M)"
record="checks/$stamp.txt"
exec > >(tee "$record") 2>&1

pass=0; fail=0
ok()  { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail=$((fail+1)); }
in_box() { docker compose exec -T mosquitto sh -c "$1" 2>&1; }
token() { openssl rand -hex 8; }

A=check-a; B=check-b
PA="$(openssl rand -hex 16)"; PB="$(openssl rand -hex 16)"
H="-h localhost -p 1883"
F=/mosquitto/config/passwd
AS="$H -u $A -P $PA"; BS="$H -u $B -P $PB"
TMP="$(mktemp)"

echo "inQbeta node — post office audit, $stamp"
echo "host:   $(hostname)"
echo "config: $(sha256sum mosquitto/config/mosquitto.conf mosquitto/config/acl | awk '{print substr($1,1,16), $2}' | tr '\n' ' ')"
echo

# 0. Running at all ------------------------------------------------------
if docker compose ps --status running --services 2>/dev/null | grep -qx mosquitto; then
  ok "broker is running"
else
  bad "broker is running — start it: docker compose up -d"; exit 1
fi
echo "image:  $(docker inspect -f '{{.Image}}' "$(docker compose ps -q mosquitto)" | cut -c1-24)"
echo

cleanup() {
  in_box "mosquitto_sub $BS -i $B-phone -t q/in/$B -W 1" >/dev/null   # clean connect ends the held session
  in_box "mosquitto_passwd -D $F $A; mosquitto_passwd -D $F $B; chown mosquitto:mosquitto $F; chmod 0600 $F" >/dev/null
  docker compose kill -s HUP mosquitto >/dev/null 2>&1
  rm -f "$TMP"
}
trap cleanup EXIT

in_box "mosquitto_passwd -b $F $A $PA && mosquitto_passwd -b $F $B $PB && chown mosquitto:mosquitto $F && chmod 0600 $F" >/dev/null
docker compose kill -s HUP mosquitto >/dev/null; sleep 1

echo "Must sign in"
in_box "mosquitto_pub $H -t q/in/$B -q 1 -m hello" >/dev/null && bad "anonymous is refused" || ok "anonymous is refused"
in_box "mosquitto_pub $H -u $A -P wrong -t q/in/$B -q 1 -m hello" >/dev/null && bad "wrong password is refused" || ok "wrong password is refused"

echo "Delivers"
t=$(token)
out=$(in_box "mosquitto_sub $BS -t q/in/$B -q 1 -C 1 -W 8 & sleep 1; mosquitto_pub $AS -t q/in/$B -q 1 -m $t; wait")
[[ $out == *$t* ]] && ok "A posts into B's inbox, B receives it" || bad "A posts into B's inbox, B receives it"

echo "Cannot read anyone else's inbox"
t=$(token)
out=$(in_box "mosquitto_sub $AS -t q/in/$B -t 'q/in/#' -q 1 -C 1 -W 4 & sleep 1; mosquitto_pub $BS -t q/in/$B -q 1 -m $t; wait")
[[ $out == *$t* ]] && bad "A cannot read B's inbox, even with a wildcard" || ok "A cannot read B's inbox, even with a wildcard"
out=$(in_box "mosquitto_sub $AS -t '\$SYS/#' -v -C 1 -W 4")
[[ $out == *'$SYS/broker'* ]] && bad "broker internals (\$SYS) are hidden" || ok "broker internals (\$SYS) are hidden"

echo "Holds for people who are away"
t=$(token)
in_box "mosquitto_sub $BS -i $B-phone -c -q 1 -t q/in/$B -W 2" >/dev/null
in_box "mosquitto_pub $AS -t q/in/$B -q 1 -m $t" >/dev/null
out=$(in_box "mosquitto_sub $BS -i $B-phone -c -q 1 -t q/in/$B -C 1 -W 5")
[[ $out == *$t* ]] && ok "B was offline, gets it on return" || bad "B was offline, gets it on return"

t=$(token)
in_box "mosquitto_pub $AS -t q/in/$B -q 1 -m $t" >/dev/null
docker compose restart mosquitto >/dev/null 2>&1; sleep 3
out=$(in_box "mosquitto_sub $BS -i $B-phone -c -q 1 -t q/in/$B -C 1 -W 5")
[[ $out == *$t* ]] && ok "a held message survives a restart" || bad "a held message survives a restart"

echo "Cannot carry more than a receipt, cannot keep anything"
in_box "mosquitto_sub $BS -t q/in/$B -C 1 -W 6" > "$TMP" & sub=$!
sleep 1
head -c 300000 /dev/zero | tr '\0' x | docker compose exec -T mosquitto mosquitto_pub $AS -t q/in/$B -q 1 -s >/dev/null 2>&1
wait $sub
grep -q xxxxxxxxxxxxxxxx "$TMP" && bad "300 KB message is refused (limit 256 KB)" || ok "300 KB message is refused (limit 256 KB)"

t=$(token)
in_box "mosquitto_pub $AS -t q/in/$B -q 1 -r -m $t" >/dev/null
out=$(in_box "mosquitto_sub $BS -t q/in/$B -C 1 -W 3")
[[ $out == *$t* ]] && bad "retained messages are refused" || ok "retained messages are refused"

echo "Cannot log who talks to whom"
logs="$(docker compose logs --no-color mosquitto 2>&1; in_box 'cat /mosquitto/log/mosquitto.log')"
grep -q -e "$PA" -e "$PB" <<<"$logs" && bad "no passwords in the logs" || ok "no passwords in the logs"
grep -q -e "$A" -e "$B" <<<"$logs" && bad "no inbox ids in the logs" || ok "no inbox ids in the logs"

echo "Kept apart"
perm=$(in_box "stat -c '%a %U' $F")
[[ $perm == "600 mosquitto" ]] && ok "password file is private (600, mosquitto)" || bad "password file is private (got: $perm)"
nets=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$(docker compose ps -q mosquitto)")
[[ $(echo $nets) == "inqbeta-node_node" ]] && ok "only on the node network" || bad "only on the node network (got: $nets)"
(exec 3<>/dev/tcp/127.0.0.1/9001) 2>/dev/null && ok "WebSocket port 9001 answers" || bad "WebSocket port 9001 answers"

echo
echo "$pass passed, $fail failed.  Kept in node/$record"
[ "$fail" -eq 0 ]
