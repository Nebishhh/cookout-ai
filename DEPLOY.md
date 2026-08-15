# Deploying CookOut AI

This covers taking the Docker setup in this repo (`Dockerfile`, `docker-compose.yml`,
`Caddyfile`) and running it on a real VPS for a handful of real users (e.g. you + a few
family members). Everything below is a **manual step a human has to perform** — an agent
can't sign up for services, redeem credits, or click through cloud dashboards on your
behalf.

The app has no real multi-user accounts yet — it's gated behind a single shared password
(`APP_ACCESS_PASSWORD`, HTTP Basic Auth) as a stopgap. Everyone who has the password sees
and can edit the same shared data (recipes, events, shopping lists). Fine for a trusted
handful of people; not a substitute for real per-user auth, which is a separate, future
piece of work.

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
APP_ACCESS_PASSWORD=choose_a_strong_shared_password
EOF
```

Edit `Caddyfile` in the repo and replace `you@example.com` (Let's Encrypt expiry notices)
and `your-domain.example.com` with your real email and domain before the next step.

## 6. Bring it up

```bash
docker compose up -d --build
docker compose logs -f app     # watch the prisma db push + server startup
```

## 7. Verify

- `curl -i https://your-domain.example.com/api/health` → `200`, no credentials needed.
- Visit `https://your-domain.example.com/` in a browser → a native Basic Auth prompt,
  then the app after entering the shared password.

## Updating after a code change

```bash
git pull
docker compose up -d --build
```

The SQLite data volume (`cookout_data`) is untouched by rebuilds or restarts — only
`docker compose down -v` (which you should never run casually) would delete it.

## Known limitation: destructive schema changes

`prisma db push` runs automatically on every container start and safely applies additive
changes (a new table or column). There's no `prisma/migrations/` history in this project
(see `CLAUDE.md`), so a genuinely destructive change (dropping/renaming a column, an
incompatible type change) will make the container **refuse to start** rather than
silently deleting data. If that happens:

```bash
docker compose exec app sh   # inspect /data/prod.db by hand before deciding how to proceed
```

This needs a human judgment call — there's no automated migration path for that case yet.
