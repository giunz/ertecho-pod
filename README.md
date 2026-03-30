# 10 Λεπτά Ακόμα — Podcast Archive

A Home Assistant add-on that automatically archives episodes of the Greek radio show **"10 Λεπτά Ακόμα"** from [ERTecho](https://www.ertecho.gr). It scrapes new episodes every weekday at 21:00, stores them locally, and serves a web UI + podcast RSS feed.

## Features

- **Automatic downloads** — scrapes ertecho.gr every weekday at 21:00 (Europe/Athens) and downloads new MP3 episodes
- **Web UI** — browse, play, and download episodes directly from the HA sidebar
- **Podcast RSS feed** — compatible with Podcast Addict, AntennaPod, and any standard podcast client
- **Local storage** — episodes saved to `/share/ertecho-pod` (visible in HA file browser / Samba)
- **No external services** — fully self-contained, SQLite database, no cloud dependency

## Installation

1. In Home Assistant go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add this repository URL: `https://github.com/giunz/ertecho-pod`
3. Find **"10 Λεπτά Ακόμα Podcast"** in the store and install it
4. Configure options (see below) and click **Start**

On first start the add-on downloads all existing episodes immediately, then switches to the daily schedule.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `base_url` | `""` | Base URL used in RSS enclosure links — set this if using podcast clients (e.g. `http://192.168.1.x:3400`) |

## Accessing the app

**Web UI:** Available directly in the HA sidebar panel via ingress — no extra port needed.

**Podcast clients** (Podcast Addict, AntennaPod, etc.): Podcast clients need a direct URL to the RSS feed. To enable this:
1. Go to the add-on → **Network** tab → enable port `3400`
2. Set `base_url` in the add-on options to `http://<your-ha-ip>:3400`
3. Add `http://<your-ha-ip>:3400/feed.xml` to your podcast client

## Storage

| Path | Contents |
|------|----------|
| `/share/ertecho-pod/` | Downloaded MP3 files — accessible via Samba / HA file browser |
| `/data/ertecho.db` | SQLite database with episode metadata (add-on private) |

## Tech stack

- [SvelteKit](https://svelte.dev) — web UI and RSS feed server
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — embedded database
- [node-cron](https://github.com/node-cron/node-cron) — episode scheduler
- [Home Assistant base image](https://github.com/hassio-addons/base) with S6 overlay process supervision
