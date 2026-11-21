# Deploying CookOut AI

This covers taking the Docker setup in this repo (`Dockerfile`, `docker-compose.yml`,
`Caddyfile`) and running it on a real VPS for a handful of real users (e.g. you + a few
family members). Everything below is a **manual step a human has to perform** — an agent
can't sign up for services, redeem credits, or click through cloud dashboards on your
behalf.

The app has real per-user accounts (email + password, cookie sessions) — each account's
recipes, events, shopping lists, pantry, and category corrections are private to it. The
earlier single-shared-password stopgap has been retired.

## 1. Get a VPS (manual)

1. Sign up for the [GitHub Student Developer Pack](https://education.github.com/pack)
   (requires a verified student email or equivalent proof).
2. Redeem the DigitalOcean or Azure credit offer included in the Pack.
3. Provision the smallest available droplet/VM (e.g. DigitalOcean's ~$4-6/mo 1GB droplet
   — paid for entirely out of the redeemed credit) running **Ubuntu 22.04 LTS** or
   **Debian 12**.
4. Note the VPS's public IP address.

## 2. Point a domain at it (manual, optional but recommended)

A real domain gets you automatic HTTPS via Caddy — without one you'd need to expose the
app over plain HTTP or fight with a self-signed cert, neither of which is worth it for
family use.

- The Student Pack includes a free `.me` domain via Namecheap's education program, or use
  any domain you already own.
- In your DNS provider, add an **A record** for your chosen subdomain (e.g.
  `cookout.yourdomain.com`) pointing at the VPS's public IP. Caddy needs this DNS record
  to be live before it can issue a Let's Encrypt certificate — if it isn't yet, Caddy
  retries automatically rather than failing hard.

## 3. Install Docker on the VPS (manual, run over SSH)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in for this to take effect
docker compose version          # confirms the Compose plugin is present
```

## 4. Open firewall ports (manual)

Allow inbound `22` (SSH), `80` and `443` (Caddy). Do **not** expose `3001` publicly —
Caddy is the only service that should be reachable from the internet; the `app` service
only listens on the internal Docker network (see `docker-compose.yml`'s `expose`, not
`ports`, entry for it). Use `ufw` or your cloud provider's firewall/security-group UI:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 5. Get the code + secrets onto the VPS (manual)

```bash
git clone https://github.com/<you>/cookout-ai.git
cd cookout-ai
```

Create `.env` by hand on the VPS — this file is gitignored and must **never** be
committed:

```bash
cat > .env <<'EOF'
GEMINI_API_KEY=your_real_gemini_key
ALLOWED_ORIGINS=https://your-domain.example.com
EOF
```

`ALLOWED_ORIGINS` must match the real domain you'll visit the app at (from step 2) — it
drives both CORS and the CSRF Origin check for cookie-authenticated requests; the app
fails closed (blocks all sign-ins) if this doesn't match what the browser actually sends.

**Upgrading a pre-auth deployment (manual — do this _before_ step 6, not after)**: if this
VPS was already running CookOut AI before per-user accounts existed, its data has no
owner, and `userId` is a _required_ column in this version's schema — the normal
`docker compose up -d --build` will refuse to start against that data (see "Schema
changes" below), and a naive `db push` would just drop the
column's constraint or fail outright. There's no one-command fix for this transition; it
needs the same two-step process this project's own `dev.db` went through, run by hand
against the mounted volume from a machine with this repo checked out and Node installed
(not through the container, which only ships the _final_ required-column schema):

1. Stop the container but keep the volume: `docker compose stop app`.
2. Locate the SQLite file backing the `cookout_data` volume (`docker volume inspect
cookout-ai_cookout_data` for its host path), and temporarily edit your local
   `prisma/schema.prisma` so the five `userId` fields (`Recipe`, `Event`, `ShoppingList`,
   `IngredientCategoryOverride`, `PantryItem`) read `String?` instead of `String` (and
   drop the `@@unique([userId, ingredientId])` compound constraints on the latter two, if
   present, since a nullable column can't safely be part of one yet).
3. `DATABASE_URL="file:/path/to/prod.db" npx prisma db push --schema=prisma/schema.prisma`
   — applies the now-optional columns.
4. `BOOTSTRAP_OWNER_EMAIL="you@example.com" BOOTSTRAP_OWNER_PASSWORD="choose_a_strong_password" DATABASE_URL="file:/path/to/prod.db" node scripts/backfillOwnerUser.js`
   — creates the bootstrap owner and reassigns every ownerless row to it.
5. `git checkout -- prisma/schema.prisma` (revert your temporary edit back to the real,
   required-column schema), then re-run the same `db push` command from step 3 — now safe,
   since every row already has a `userId`.
6. Mark the volume as already holding the baseline schema ("Baselining an existing
   database" below), then proceed to step 6 (`docker compose up -d --build`) as normal:
   its own `migrate deploy` on startup is then a no-op, since the schema already matches
   and the history row is in place.

Skip all of this for a brand-new deployment — there's nothing to backfill, and the
`migrate deploy` in step 6 builds an empty database from `prisma/migrations` without issue.

Edit `Caddyfile` in the repo and replace `you@example.com` (Let's Encrypt expiry notices)
and `your-domain.example.com` with your real email and domain before the next step.

## 6. Bring it up

```bash
docker compose up -d --build
docker compose logs -f app     # watch the prisma migrate deploy + server startup
```

## 7. Verify

- `curl -i https://your-domain.example.com/api/health` → `200`, no credentials needed.
- Visit `https://your-domain.example.com/` in a browser → the CookOut AI login/signup
  screen. Sign up a real account (or log in, if you ran the backfill step above) and
  confirm you land in the app.

## Updating after a code change

```bash
git pull
docker compose up -d --build
```

The SQLite data volume (`cookout_data`) is untouched by rebuilds or restarts — only
`docker compose down -v` (which you should never run casually) would delete it.

## Schema changes

`prisma migrate deploy` runs automatically on every container start and applies whatever
migrations under `prisma/migrations` this database hasn't recorded yet, in order. Additive
and destructive changes alike go through the same path, because a destructive one ships as
a reviewed migration written alongside the code change rather than being inferred at
startup (see `CLAUDE.md` for the local workflow that writes them).

Two failures are deliberate, and both stop the container instead of touching data:

- **`P3005`: the database has tables but no `_prisma_migrations` history.** It predates the
  migration baseline — see "Baselining an existing database" below.
- **A recorded migration no longer matches the shipped one.** The volume and the image
  disagree about history; inspect before doing anything:

  ```bash
  docker compose exec app sh   # inspect /data/prod.db by hand before deciding how to proceed
  ```

## Baselining an existing database

A volume created before `prisma/migrations` existed was built by `prisma db push`, so it
holds the right tables but no history, and `migrate deploy` refuses it. Mark it as already
holding the baseline **once**, with a backup in hand first:

```bash
docker compose stop app
docker volume inspect cookout-ai_cookout_data     # find the host path of prod.db
cp /path/to/prod.db /path/to/prod.db.bak          # take the backup before anything else
DATABASE_URL="file:/path/to/prod.db" npx prisma migrate resolve --applied 0_init --schema=prisma/schema.prisma
DATABASE_URL="file:/path/to/prod.db" npx prisma migrate status --schema=prisma/schema.prisma
docker compose up -d
```

`migrate resolve --applied` writes only the history row — it never runs the migration's SQL,
so no table is touched and no row is lost. `migrate status` should then report the database
up to date. Run this from a machine with this repo checked out and Node installed, not
through the container.
