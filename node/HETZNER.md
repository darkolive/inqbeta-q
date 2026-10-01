# The node on Hetzner — a test from the federation's point of view

**Run, 1 October 2026: every check passed.** See *Results* at the end. Rent the smallest Hetzner server and
bring up three pieces of the node (`docs/q/home-node.md`) together:

- **Mosquitto**, the post office (ADR-Q-010), audited by `bin/check.sh`;
- **Dgraph**, the node's own index (home-node.md §5);
- **Nebula**, the federation's private mesh, with this server as its
  **lighthouse** (home-node.md §8: "lighthouse needs").

The **Mac is the member**: it joins the mesh from home, behind the BT router,
and reaches the node's services the way a federation would. The internet
reaches none of them. The mini PC stays out of it for now.

Done means: `bin/check.sh` (on the server) and `bin/check-mesh.sh` (on the
Mac) show every line **PASS**, and both results are kept in `node/checks/`.

| | Address | Who can reach it |
|---|---|---|
| SSH | public :22 | you, with your key |
| Nebula | public UDP :4242 | anyone can knock; only holders of a cert signed by the test CA get in |
| Post office 1883 / 9001 | 10.42.0.1 (mesh) | members (group `member`) |
| Dgraph 8080 / 9080 | 10.42.0.1 (mesh) | members |
| Everything else | — | nobody |

---

## 1. The server (10 min, in the Hetzner console)

- **Type:** CPX12 (1 vCPU, 2 GB). Billed by the hour; delete it after and the
  bill stops. If Dgraph struggles, rescale to CPX22 choosing **CPU and RAM
  only**, so you can scale back down.
- **Image:** Ubuntu **24.04** rather than 26.04. Docker's installer and
  Nebula's packages are proven on 24.04; 26.04 is days old.
- **Networking:** IPv4 and IPv6.
- **SSH key:** add the Mac's public key (`cat ~/.ssh/id_ed25519.pub`; if there
  isn't one, `ssh-keygen -t ed25519`).
- **Firewall:** create one, inbound only:
  - TCP 22 (SSH)
  - UDP 4242 (Nebula)

  Nothing else. Docker can open ports past the server's own firewall, but not
  past Hetzner's, which sits outside the server.
- Note the **public IPv4** — `SERVER_IP` below.

## 2. The certificates (on the Mac, 10 min)

The CA is the test federation's authority. **`ca.key` stays on the Mac and
never goes to any server or into git** (`nebula/pki/` is git-ignored).

```sh
brew install nebula mosquitto
cd ~/inqbeta-q/node && mkdir -p nebula/pki && cd nebula/pki
nebula-cert ca   -name "inQbeta test federation" -duration 2160h   # 90 days
nebula-cert sign -name lighthouse -ip 10.42.0.1/24 -groups node
nebula-cert sign -name mac        -ip 10.42.0.2/24 -groups member
ls   # ca.crt ca.key lighthouse.crt lighthouse.key mac.crt mac.key
```

Then set `SERVER_IP` in `nebula/member.yml`.

Whether a federation's own key can sign this CA (ADR-Q-007) is **not** tested
here. That is the next question, once the mesh works at all.

## 3. Onto the server (15 min)

From the Mac, copy the node folder and the lighthouse's certificate only:

```sh
cd ~/inqbeta-q
rsync -av --exclude 'pki/' --exclude 'checks/*' node/ root@SERVER_IP:/srv/node/
scp node/nebula/pki/{ca.crt,lighthouse.crt,lighthouse.key} root@SERVER_IP:/tmp/
ssh root@SERVER_IP
```

On the server:

```sh
apt update && apt -y upgrade
# 2 GB swap, so a Dgraph spike slows down instead of being killed
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Nebula (the lighthouse) — runs on the host, starts before Docker
cd /tmp && curl -fsSLO https://github.com/slackhq/nebula/releases/latest/download/nebula-linux-amd64.tar.gz
tar xzf nebula-linux-amd64.tar.gz && install -m 755 nebula nebula-cert /usr/local/bin/
mkdir -p /etc/nebula && chmod 700 /etc/nebula
mv /tmp/ca.crt /etc/nebula/ca.crt
mv /tmp/lighthouse.crt /etc/nebula/host.crt
mv /tmp/lighthouse.key /etc/nebula/host.key && chmod 600 /etc/nebula/host.key
cp /srv/node/nebula/lighthouse.yml /etc/nebula/config.yml
cp /srv/node/nebula/nebula.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now nebula
ip addr show nebula1        # expect inet 10.42.0.1/24

# Docker
curl -fsSL https://get.docker.com | sh
```

## 4. Start the node

```sh
cd /srv/node
echo 'COMPOSE_FILE=compose.yaml:compose.hetzner.yaml' > .env   # every script then uses both files
mkdir -p dgraph && chown -R 1883:1883 mosquitto/data mosquitto/log
bin/add-user.sh darren          # keep the password
bin/add-user.sh friend
docker compose up -d
docker compose ps               # mosquitto, dgraph-zero, dgraph-alpha: running
free -h                         # how much of the 2 GB is left
```

Pin the images, as in `README.md` §5:

```sh
docker image inspect eclipse-mosquitto:2 dgraph/dgraph:latest --format '{{index .RepoDigests 0}}'
```

## 5. The audits

On the server — the post office's musts and cannots, unchanged from day one:

```sh
bin/check.sh
```

On the Mac — join the mesh, then the federation's view:

```sh
cd ~/inqbeta-q/node
sudo nebula -config nebula/member.yml     # leave this running in its own window
bin/check-mesh.sh SERVER_IP darren <darren's password>
```

`check-mesh.sh` tests:

| Checks | Rule |
|---|---|
| the node answers on 10.42.0.1 | the Mac got through the BT router into the mesh |
| Dgraph healthy; write a node, read it back | a member can use the index |
| 1883 and 9001 answer; a message goes round | a member can use the post office |
| 1883, 9001, 8080, 9080, 5080, 7080 closed on the public address | **cannot** be reached from the internet |

Copy the server's `checks/*.txt` back and commit both:
`scp 'root@SERVER_IP:/srv/node/checks/*' node/checks/`

## 6. Look around (optional)

Dgraph's own screen, Ratel, runs on the Mac and talks to the node over the
mesh: `docker run --rm -p 8000:8000 dgraph/ratel`, open
`http://localhost:8000`, server URL `http://10.42.0.1:8080`.

Write down while it runs: memory in use (`free -h`, `docker stats`), and how
long the Mac took to join the mesh. Those answer home-node.md §8.

## What this proves, and what it doesn't

**Proves:** a member behind a home router joins a federation's mesh through a
rented lighthouse; reaches the post office and Dgraph there; and nothing on
the node is visible from the internet. A Compose file and a Nebula config are
all a node is, so the same files run on any box with a public address.

**Doesn't prove:**

- **a node behind a home router.** Here the node has a public address. The
  mini PC won't; Nebula must punch through for it, as it did for the Mac, or
  relay. That's the mini PC's test.
- **the post office for strangers.** It is only on the mesh here. Reaching it
  from the internet (secure WebSockets, Caddy, a domain) is ADR-Q-010 §6.
- **a federation key as the CA**, revocation, or several federations' meshes
  on one node.
- **a stretched Dgraph cluster** (three members, home-node.md §8).

## Undo

```sh
# on the Mac: Ctrl-C the nebula window
# in the Hetzner console: delete the server (and the firewall)
```

The CA on the Mac can be kept for the next test or deleted
(`rm -rf node/nebula/pki`).

## Results — 1 October 2026

First run of the post office anywhere, and of Nebula and Dgraph together.

- **Server:** Hetzner CPX12, Helsinki, Ubuntu 24.04.5, Nebula 1.11.2,
  Docker 29.8.2, Compose 5.5.1. Address 135.181.156.21.
- **`bin/check.sh`:** 15 passed, 0 failed (`checks/2026-10-01-0707.txt`).
- **`bin/check-mesh.sh`** from the Mac: 12 passed, 0 failed
  (`checks/mesh-2026-10-01-0809.txt`).
- **Joining the mesh:** the Mac, behind the BT router, completed its handshake
  with the lighthouse in **57 ms**, with no port forwarding.
- **Memory** with Mosquitto, Dgraph Zero and Alpha running: 471 MB used of
  1.9 GB, swap untouched. CPX12 is enough for this test.

**To follow up:**

- Mosquitto 2.1 warns that the password file should be owned by root;
  `add-user.sh` and `check.sh` give it to `mosquitto`. It works today; it will
  stop working in a future version.
- Pin `eclipse-mosquitto:2` and `dgraph/dgraph:latest` to their digests.

## The full cycle — 1 October 2026, later

The storage unit added (ADR-Q-014): SeaweedFS, 1 GB (8 × 128 MB volumes),
filer on the mesh only (`10.42.0.1:8888`).

- **`bin/check-cycle.sh`** from the Mac: **14 passed, 0 failed**
  (`checks/cycle-2026-10-01-1110.txt`). Friend sealed a receipt into storage
  and rang darren's bellboy while darren was away; the notice (408 bytes,
  sealed) waited; darren came back, saw "friend — Meet at the green",
  collected the receipt, the hash matched, it opened (**Captured**), custody
  was released and the holding bay and the bellboy were both empty again.
- **Memory** with all four services: 534 MB used of 1.9 GB, swap barely
  touched (256 KB).
- Sealing in the test is a stand-in (openssl AES); `seal.ts` replaces it in Q.

## Step 5 — the node's front doors (ADR-Q-016), 1 October 2026

Two public names, with certificates from Caddy, and nothing else opened:

- `wss://bellboy.135-181-156-21.sslip.io` → the bellboy's **public, read-only**
  listener (port 9002): anyone may listen for "federation X has news"; nobody
  may publish there.
- `https://storage.135-181-156-21.sslip.io` → the **gate** (`gate/server.mjs`):
  stores a federation's announcements only if every one, and the publication,
  is signed by that federation, newer than what's held and made in the last
  ten minutes; then it pings the news channel. Only federations listed in
  `GATE_FEDERATIONS` are served.

Hetzner firewall: TCP 22, UDP 4242, TCP 80 and 443. Mosquitto now uses
`per_listener_settings true` (1883 and 9001 sign-in as before; 9002 public).

Set up once, on the server, in `/srv/node`:

```sh
bin/add-user.sh gate                               # the gate's own bellboy account
echo 'GATE_MQTT_PASSWORD=<the password it printed>' >> .env
echo 'GATE_FEDERATIONS=<the federation DID>' >> .env
mkdir -p caddy/data caddy/config
docker compose up -d && docker compose restart mosquitto
```
