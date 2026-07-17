# Your Own Solo Pool — forked from Public Pool

## Quickstart: push this straight to GitHub

This kit is now a complete, ready-to-push repo — `atomos-repo.zip` contains
`backend/` and `frontend/` with all the ATOMOS branding and features already
applied (I applied them directly to real cloned copies of the upstream repos,
not just written as instructions — see "What's already applied" below).

```bash
unzip atomos-repo.zip
cd atomos-repo
git init
git add .
git commit -m "ATOMOS: solo mining pool, forked from Public Pool"
git remote add origin https://github.com/YOUR_USER/atomos.git
git branch -M main
git push -u origin main
```

If `YOUR_USER/atomos` doesn't exist yet, create an empty repo on GitHub first
(no README/license/gitignore — those already exist here) then run the above.

### What's already applied (verified, not just described)

- **Webhook alerts** (`webhook.service.ts`, `notification.service.ts`,
  `app.module.ts` registration) — compiles clean (`tsc --noEmit`), and the
  existing `stratum-v1.service.spec.ts` test suite (6 tests) still passes.
- **New-best-difficulty alert** wired into `StratumV1Client.ts` — same
  verification as above.
- **ATOMOS branding** — `index.html` title/theme link, Google Fonts (Orbitron
  + Share Tech Mono), topbar logo, splash screen text, and the black
  cyberpunk `atomos-dark/theme.css` are all already in place in `frontend/`.

One thing I couldn't verify in this environment: a full Angular production
build of `frontend/` (`ng build`) timed out here before finishing — the edits
themselves are small, low-risk text/CSS changes (no template logic touched),
but run `npm install && npx ng build` yourself once, before you build the
Docker image, just to be safe.

Also worth knowing: `backend/secrets/cert.pem` and `key.pem` are dummy
self-signed dev certs that ship with the upstream project (for local TLS
testing) — not something I generated, and not meant for production use as-is.

### Still manual (needs your input)

- Docker image build & push (needs your Docker Hub/GHCR account — step 4 below)
- Your own `umbrel-app.yml` metadata (developer name, repo URL, screenshots)
- A real favicon/logo (currently still the original Public Pool SVG logo)

---

This is a starter kit for turning [Public Pool](https://github.com/benjamin-wilson/public-pool)
(the same open-source software behind publicpool.io, and already an official
Umbrel app) into **your own branded, custom app**.

Public Pool architecture, confirmed from source:
- **`server`** — NestJS/TypeScript stratum server (`benjamin-wilson/public-pool`). Talks to
  your bitcoind over RPC (`getblocktemplate` / `submitblock`), runs the Stratum V1
  listener on port 2018 that your ASICs connect to, tracks shares in SQLite.
- **`web`** — Angular UI (`benjamin-wilson/public-pool-ui`), shows hashrate/miners/blocks.
- **`proxy`** — nginx routing `/` to the UI and `/api/*` to the server.
- **`widget-server`** — tiny service that feeds the Umbrel home-screen widget.

On Umbrel, `${APP_BITCOIN_NODE_IP}`, `APP_BITCOIN_RPC_USER/PASS/PORT` are injected
automatically from your installed Bitcoin node app — that's the "no extra setup"
part, and your fork keeps that for free.

## What's in this kit

```
backend-changes/
  webhook.service.ts        # NEW: generic webhook notifier (Discord/Slack/ntfy/JSON)
  notification.service.ts   # MODIFIED: wires webhook.service into the existing notify flow
  StratumV1Client.diff      # NEW: patch adding the "new best difficulty" alert hook
frontend-changes/
  atomos-theme.css           # NEW: black cyberpunk theme (teal/pink/purple accents, monospace)
  BRANDING.md                 # exact file/line changes for the ATOMOS name + logo + font
app-package/
  umbrel-app.yml             # Your app's manifest (rename, describe, icon, gallery)
  docker-compose.yml         # Your app's services (points at YOUR docker images)
  data/proxy/nginx.conf      # Reverse proxy config (needs your app id substituted in)
```

## How the Bitcoin Core auto-connection actually works

This is the part that looked like magic in Public Pool, but it's just two
pieces of Umbrel's app framework, both already in `app-package/`:

1. **`umbrel-app.yml` → `dependencies: [bitcoin]`**
   This tells umbrelOS "don't let this app install unless the official
   Bitcoin Core app is installed." Umbrel then knows which node's credentials
   to hand this app.

2. **`docker-compose.yml` → the `server` service's environment block**
   ```yaml
   - BITCOIN_RPC_URL=http://${APP_BITCOIN_NODE_IP}
   - BITCOIN_RPC_USER=${APP_BITCOIN_RPC_USER}
   - BITCOIN_RPC_PASSWORD=${APP_BITCOIN_RPC_PASS}
   - BITCOIN_RPC_PORT=${APP_BITCOIN_RPC_PORT}
   ```
   `${APP_BITCOIN_NODE_IP}`, `${APP_BITCOIN_RPC_USER}`, `${APP_BITCOIN_RPC_PASS}`,
   and `${APP_BITCOIN_RPC_PORT}` are **not env vars you set** — umbrelOS
   substitutes them automatically at install/start time with the real values
   from whichever Bitcoin Core instance is running on that node. That's the
   entire "no extra setup" mechanism.

Since this kit's `docker-compose.yml` already has both pieces (I copied the
pattern straight from the real, currently-published Public Pool app package),
your fork gets this for free — nothing extra to build. Just don't rename or
remove those four variables, and keep `dependencies: [bitcoin]` in
`umbrel-app.yml`.



## 1. Fork the two repos

```bash
# on GitHub: fork these into your own account, then clone your forks
git clone https://github.com/YOUR_USER/public-pool.git backend
git clone https://github.com/YOUR_USER/public-pool-ui.git frontend
```

## 2. Add the webhook feature (functional customization)

The upstream project already has Discord-bot and Telegram-bot notifiers, but both
need bot tokens/guild IDs — overkill for a personal box. This adds a **one-URL**
webhook notifier that works with a Discord webhook link, Slack incoming webhook,
or an [ntfy.sh](https://ntfy.sh) topic (free push notifications to your phone,
zero signup).

1. Copy `backend-changes/webhook.service.ts` → `backend/src/services/webhook.service.ts`
2. Replace `backend/src/services/notification.service.ts` with
   `backend-changes/notification.service.ts`
3. Apply `backend-changes/StratumV1Client.diff` (see below for what it does)
4. In `backend/src/app.module.ts`:
   - add `import { WebhookService } from './services/webhook.service';`
   - add `WebhookService,` to the `providers: [...]` array
5. Set env vars when running the container: `WEBHOOK_URL` and `WEBHOOK_FORMAT`
   (`discord` | `slack` | `ntfy` | `json`). Leave `WEBHOOK_URL` blank to disable.

Test locally without a full mining setup by calling it directly, e.g. temporarily
add a debug route, or just trigger `onModuleInit` by starting the server with
`WEBHOOK_URL` set — you should get a "Server restarted" ping.

### New: "best difficulty" alerts

The per-client best-difficulty tracking actually lives in
`src/models/StratumV1Client.ts` (not the jobs service — that file only builds
block templates), right where each submitted share is validated. This is
where `bestDifficulty` gets compared and persisted every time a miner beats
their own record.

`backend-changes/StratumV1Client.diff` is a ready-to-apply patch (verified: I
cloned the real repo, applied it, type-checked it with `tsc --noEmit`, and ran
the existing `stratum-v1.service.spec.ts` suite — all 6 tests still pass). Apply it with:

```bash
cd backend
git apply /path/to/StratumV1Client.diff
```

It does two things:
1. Pulls the existing block-found check into a named `isBlockFound` boolean
   (no behavior change).
2. Right after the existing `bestDifficulty` update, calls
   `this.notificationService.notifyNewBestDifficulty(...)` — but only when
   `!isBlockFound`, so you don't get a "new best difficulty" ping immediately
   followed by a "BLOCK FOUND" ping for the same share.

This calls a new `notifyNewBestDifficulty` method on `NotificationService`
(already included in the updated `notification.service.ts` in this kit), which
forwards to `webhookService.notifyNewBestDifficulty` (already stubbed in
`webhook.service.ts` from the first pass).

Net effect: every time any of your workers sets a new personal-best share
difficulty, you get a push notification like:

> 📈 New best difficulty for bc1q...xyz: 2,147,483,648

Heads up on volume: early on, "new best" fires often since every difficulty
is a record; it naturally quiets down over time as the bar gets higher. If
it's too noisy, an easy throttle is to only notify when the new difficulty is
some multiple (e.g. 2x) of the last notified value — happy to add that if you
want it.

**Other ideas for more functional changes**, once this pattern feels comfortable:
- Change minimum share difficulty defaults in `config/default-0.json`.
- Add a weekly/daily summary webhook (total shares, current best) via
  `ScheduleModule`, which is already imported in `app.module.ts`.

## 3. Rebrand the UI — done for you as ATOMOS (cosmetic customization)

`frontend-changes/BRANDING.md` has the exact file/line changes (verified
against the real source) to rename the app to **ATOMOS**, with the dashboard
subtitle **"Atomos Solo Mining."** `frontend-changes/atomos-theme.css` is a
ready-made black cyberpunk theme — dark surfaces, teal/pink/purple accents,
monospace type — matching the preview mockup shown in chat. Follow
`BRANDING.md` to drop it in and swap the `theme-css` link in `index.html`.

`POOL_IDENTIFIER` is already set to `"Atomos Solo Mining"` in this kit's
`docker-compose.yml` — that's the name shown to your ASICs in their pool config.

## 4. Build and push your own images

Umbrel pulls prebuilt images (it doesn't build from a Dockerfile on install), so
you need to build and push to a registry you control:

```bash
docker build -t YOUR_DOCKERHUB_USER/my-solo-pool:1.0.0 ./backend
docker push YOUR_DOCKERHUB_USER/my-solo-pool:1.0.0

docker build -t YOUR_DOCKERHUB_USER/my-solo-pool-ui:1.0.0 ./frontend
docker push YOUR_DOCKERHUB_USER/my-solo-pool-ui:1.0.0
```

Then edit `app-package/docker-compose.yml` and replace the two `image:` lines
with your tags.

## 5. Finish the app package

1. Pick a unique app id, e.g. `my-solo-pool`, and replace every `my-solo-pool`
   placeholder in `umbrel-app.yml`, `docker-compose.yml`, and
   `data/proxy/nginx.conf` (container names follow the pattern `<id>_<service>_1`).
2. Fill in `name`, `developer`, `repo`, `tagline` in `umbrel-app.yml`.
3. Add a `1.jpg` / `2.jpg` gallery screenshot and an `icon.svg` next to
   `umbrel-app.yml` (Umbrel app packages expect a square SVG/PNG icon — check
   any other app folder in https://github.com/getumbrel/umbrel-apps for the
   exact filename Umbrel expects, since this detail is versioned in their repo).

## Publishing this to your GitHub repo

I can create/push these files directly to your GitHub repo once you connect
your GitHub account (you should see a connect prompt from this message) —
just tell me the repo name (new or existing) and I'll push the `app-package/`,
`backend-changes/`, and `frontend-changes/` folders there. Until then, you can
also just download these files and `git add`/`commit`/`push` them yourself.

## 6. Install it on your Umbrel node

The easiest path is a personal "community app store": push this whole
`app-package/` folder (renamed to your app id) as a directory inside its own git
repo, then on your Umbrel: **Settings → App Store → Add community app store**,
paste your repo URL, and install your app from there like any other.

## 7. Test before trusting it with real hardware

- Point one ASIC at `stratum+tcp://<umbrel-ip>:2018` with your BTC address as
  the username and confirm shares show up in the UI.
- Trigger the webhook manually (restart the container) and confirm you get a
  notification.
- Only after that, treat it as your primary solo-mining endpoint.

---

Everything here builds directly on top of the real, audited upstream project —
you're not reinventing the stratum protocol or block-template logic, just
adding your own name and an easier notification path on top of proven code.
