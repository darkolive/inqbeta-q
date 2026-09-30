# The node — day one: a standalone post office

**Plan for 29 September 2026.** Plug in the mini PC and bring up the first
piece of the home node (`docs/q/home-node.md`): **Mosquitto**, the post office
for person-to-person messages (ADR-Q-010). Nothing else yet: no media, no
Dgraph, no Nebula, nothing reachable from outside the house.

Done means: `bin/check.sh` shows every line **PASS**, and the result is kept
in `node/checks/`.

---

## 1. Find out what the box is (10 min)

On the mini PC (or over SSH):

```sh
cat /etc/os-release        # which OS
lscpu | head -15           # CPU
free -h                    # RAM
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT   # disks
ip -4 addr | grep inet     # its address on the home network
```

Write the answers into `docs/q/home-node.md` §8 (the first research box).

**If it isn't running Linux:** Ubuntu Server 24.04 LTS is the suggestion
(Debian 12 is fine too). Installing it **wipes the disk**, so check first
that nothing on it (films, music) needs keeping. Stop and decide together if
there is.

## 2. Install Docker (10 min)

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out and back in
docker run --rm hello-world        # proves it works
```

## 3. Get the node files

```sh
git clone https://github.com/darkolive/inqbeta-q.git   # or copy the node/ folder across
cd inqbeta-q/node
sudo chown -R 1883:1883 mosquitto/data mosquitto/log   # Mosquitto runs as uid 1883
```

## 4. Make the first inboxes

Day one uses plain names and passwords. Later, Q signs in with its DID and
the inbox id comes from the key (ADR-Q-010 §2 and §5).

```sh
bin/add-user.sh darren
bin/add-user.sh friend
```

Each prints a password once. Keep them.

## 5. Start it

```sh
docker compose up -d
docker compose logs mosquitto          # expect "mosquitto version 2.x running"
docker image inspect eclipse-mosquitto:2 --format '{{index .RepoDigests 0}}'
```

Copy that digest into `compose.yaml` in place of `eclipse-mosquitto:2`, so the
node runs exactly the image that was checked and nothing changes under it.

## 6. The audit

```sh
bin/check.sh
```

It tests every must and cannot in the config, against the running broker:

| Checks | Rule |
|---|---|
| anonymous refused, wrong password refused | **must** sign in |
| A posts into B's inbox, B receives it | delivers |
| A can't read B's inbox, even with `q/in/#`; `$SYS` hidden | **cannot** read others' inboxes |
| B offline gets it on return; survives a restart | **must** hold for people who are away |
| 300 KB refused; retained messages refused | **cannot** carry more than a receipt, **cannot** keep anything |
| no passwords or inbox ids in the logs | **cannot** log who talks to whom |
| password file 600; only on the node network; port 9001 answers | kept apart |

Every run is saved as `node/checks/<date>.txt`. Commit the first one.

## 7. Try it from the Mac

On the Mac (`brew install mosquitto` gives the command-line tools), with the
mini PC's address from step 1:

```sh
# window 1 — listen as darren
mosquitto_sub -h <mini-pc-ip> -u darren -P <pw> -t q/in/darren -q 1 -v
# window 2 — post as friend
mosquitto_pub -h <mini-pc-ip> -u friend -P <pw> -t q/in/darren -q 1 -m "hello from the node"
```

The browser side (Q over WebSockets on port 9001) is the next step, not today.

## Not today

- **Reaching it from outside the house.** Needs a decision (ADR-Q-010 §6):
  a Cloudflare Tunnel on a domain moved to Cloudflare's free DNS, or a router
  port and Caddy.
- **Signing in with a DID** instead of passwords (ADR-Q-010 §5).
- **Web Push** to wake sleeping phones; the `message.send` action in Cedar.
- Media, Dgraph, iroh relay, Nebula (home-node.md).

## Undo

```sh
docker compose down            # stop; inboxes and held messages stay
docker compose down -v && sudo rm -rf mosquitto/data/* mosquitto/log/*   # forget everything
```
