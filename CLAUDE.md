# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Home Assistant add-on** that archives the Greek radio show "10 Λεπτά Ακόμα" from ertecho.gr. It scrapes MP3 episodes from the ertecho.gr WordPress REST API, stores metadata in SQLite, serves a web UI, and exposes a podcast RSS 2.0 feed compatible with clients like Podcast Addict.

## Commands

```bash
# Development
npm install
npm run dev          # SvelteKit dev server on :5173

# Build
npm run build        # outputs to build/
npm run preview      # preview production build

# Run scraper manually (needs DATABASE_PATH and AUDIO_DIR env vars)
npx tsx scripts/scraper.ts              # run once
npx tsx scripts/scraper.ts --schedule   # run now + weekdays 21:00 Athens

# Local Docker (dev/testing — not HA)
cp .env.example .env
docker compose up
```

## Home Assistant deployment

This project is structured as a custom HA add-on. To install:

1. In HA → Settings → Add-ons → Add-on Store → ⋮ → Repositories → add the URL of the git repo containing this directory
2. Install "10 Λεπτά Ακόμα Podcast" from the store
3. Configure `audio_path` (default `/share/ertecho-pod`) and optionally `base_url` (needed for RSS enclosure URLs when accessed from podcast clients)
4. Start the add-on

The add-on panel shows the web UI via HA ingress — no extra port needed.

**For podcast clients** (Podcast Addict, AntennaPod, etc.) two options:
- **Option A (recommended for local network / VPN):** Enable port 3400 in the add-on's Network tab in HA, then use `http://<ha-ip>:3400/feed.xml` and set `base_url` to the same.
- **Option B (ingress only):** Use `http://<ha-ip>:8123/api/hassio_ingress/ertecho_pod/feed.xml` with a HA Long-Lived Access Token as a HTTP header — supported by some advanced clients.

## Architecture

Two S6-supervised processes run inside the single container:

- **`web`** — SvelteKit Node server. Serves the web UI, `/feed.xml` RSS, and `/audio/[filename]` streaming.
- **`scraper`** — Runs `scripts/scraper.ts --schedule`. Starts immediately on launch, then fires every weekday at 21:00 Europe/Athens via `node-cron`.

### Key source files

| File | Purpose |
|------|---------|
| `config.yaml` | HA add-on manifest (options schema, ports, ingress, arch) |
| `build.yaml` | HA builder config (base image per arch) |
| `rootfs/etc/s6-overlay/` | S6 service definitions for `web` and `scraper` |
| `src/hooks.server.ts` | Runs `initSchema()` (SQLite CREATE TABLE IF NOT EXISTS) at startup |
| `src/lib/db.ts` | `better-sqlite3` singleton + typed query helpers |
| `src/lib/types.ts` | `Episode`, `WpPost`, `WpMedia` interfaces |
| `src/routes/feed.xml/+server.ts` | RSS 2.0 with iTunes namespace; enclosure URLs use `PUBLIC_BASE_URL` |
| `src/routes/audio/[filename]/+server.ts` | Streams MP3s from `AUDIO_DIR` with HTTP range request support |
| `scripts/scraper.ts` | Paginates WP API, resolves media IDs, downloads MP3s, upserts DB |

### ertecho.gr API

- `GET /wp-json/wp/v2/podcast?search=10+λεπτα+ακομα&per_page=100&page=N` — `acf.audio_file` = media ID, `acf.duration_in_seconds` = duration
- `GET /wp-json/wp/v2/media/{id}` — `source_url` = direct MP3 URL, `media_details.filesize_in_bytes`

### Add-on options (configured in HA UI)

| Option | Default | Notes |
|--------|---------|-------|
| `audio_path` | `/share/ertecho-pod` | Where MP3s are stored; `/share` is visible in HA file browser |
| `base_url` | `""` | Set to e.g. `http://192.168.1.x:3400` for podcast client RSS links to work |

### Environment variables (set by S6 run scripts from options)

| Variable | Value |
|----------|-------|
| `DATABASE_PATH` | `/data/ertecho.db` (HA private storage, persists across restarts) |
| `AUDIO_DIR` | Value of `audio_path` option |
| `PUBLIC_BASE_URL` | Value of `base_url` option (if set) |
| `PORT` | `3400` |

### DB schema (SQLite)

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
wp_post_id INTEGER UNIQUE NOT NULL,
wp_media_id INTEGER,
title TEXT NOT NULL,
description TEXT,
published_at TEXT NOT NULL,        -- ISO 8601
duration_seconds INTEGER,
file_size INTEGER,
filename TEXT UNIQUE,              -- e.g. 20260330-dekalepta.mp3
source_url TEXT,
downloaded INTEGER DEFAULT 0,     -- 0 or 1
created_at TEXT DEFAULT (datetime('now'))
```

The scraper duplicates the DB helpers from `src/lib/db.ts` inline to avoid resolving SvelteKit's `$lib` aliases outside the SvelteKit context.

### Dockerfile notes

Two-stage build: Stage 1 uses `node:22-alpine` to compile SvelteKit. Stage 2 uses `$BUILD_FROM` (HA base image), reinstalls only production deps (so `better-sqlite3` is compiled natively for the target arch), then copies the built app.
