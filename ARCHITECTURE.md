# Architecture

## System Overview

**10 Λεπτά Ακόμα** is a Home Assistant add-on that automatically archives Greek radio episodes. It has three main responsibilities:

1. **Scraper** — Fetches new episodes from ertecho.gr WordPress API and downloads MP3 files
2. **Web UI** — Serves a SvelteKit-based dashboard for browsing and playing episodes
3. **RSS Feed** — Exposes a podcast-compatible RSS 2.0 feed for external clients

The system runs as a containerized Home Assistant add-on with two S6-supervised processes and a single SQLite database.

---

## Data Flow

```
ertecho.gr (WordPress REST API)
    ↓
[scraper] Fetches /wp-json/wp/v2/podcast?search=...
    ↓
[WP API] Returns posts with audio_file media ID
    ↓
[scraper] Resolves media IDs via /wp-json/wp/v2/media/{id}
    ↓
[source_url] Direct MP3 URL + file metadata
    ↓
[scraper] Downloads MP3 → /share/ertecho-pod/{filename}
    ↓
[scraper] Upserts episode record in SQLite
    ↓
[web/RSS] Queries database, serves UI & feed
    ↓
[User] Plays episodes locally or via podcast client
```

### Scraper Lifecycle

1. **On startup** — Immediate full sync: paginate WP API, download all missing episodes (takes 5–10 minutes)
2. **Scheduled run** — Every weekday at 21:00 Europe/Athens: fetch new posts, download only new episodes
3. **Database upsert** — Each episode is matched by `wp_post_id` (unique constraint); existing rows updated, new rows inserted

---

## System Architecture

### Processes

Two processes run inside the container, supervised by S6 overlay:

| Process | Command | Purpose |
|---------|---------|---------|
| **web** | `node build/index.js` | SvelteKit server (web UI + RSS feed + audio streaming) |
| **scraper** | `tsx scripts/scraper.ts --schedule` | Cron scheduler + episode downloader |

Each logs to `/run/service/{web,scraper}/log/main/current` (readable via `ha logs addon_ertecho_pod`).

### Container Image

**Base:** Home Assistant's standard add-on base image (per target arch: amd64, armv7, aarch64)

**Build stages:**
1. `node:22-alpine` — compile SvelteKit (lightweight, temp)
2. HA base image — final container with production Node modules compiled natively for target arch

This ensures `better-sqlite3` (native binding) compiles for the exact target CPU, avoiding architecture mismatches.

---

## Database

### Schema (SQLite)

```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wp_post_id INTEGER UNIQUE NOT NULL,     -- From WP API, prevents duplicates
  wp_media_id INTEGER,                    -- Media object ID for metadata lookup
  title TEXT NOT NULL,
  description TEXT,                       -- HTML from WP excerpt
  published_at TEXT NOT NULL,             -- ISO 8601, e.g. 2026-04-22T20:00:00Z
  duration_seconds INTEGER,               -- From media_details or ACF field
  file_size INTEGER,                      -- Bytes, from media object
  filename TEXT UNIQUE,                   -- e.g. 20260422-dekalepta.mp3
  source_url TEXT,                        -- Direct MP3 URL from media object
  downloaded INTEGER DEFAULT 0,           -- 0 = not yet downloaded, 1 = file exists
  created_at TEXT DEFAULT (datetime('now'))
);
```

### File Naming

MP3 filenames are generated as `{YYYYMMDD}-dekalepta.mp3` from the episode's published date, ensuring predictable URLs for RSS feed enclosures.

### Query Patterns

- **Fetch all for UI** — `SELECT * FROM episodes ORDER BY published_at DESC` (load all in memory, paginate in UI)
- **Check if exists** — `SELECT id FROM episodes WHERE wp_post_id = ?` (before upsert)
- **Upsert** — `INSERT OR REPLACE` with timestamp logic (SQLite idempotency)

---

## Web Server

### SvelteKit Routes

| Route | Handler | Purpose |
|-------|---------|---------|
| `/` | `+page.server.ts`, `+page.svelte` | Episode list UI (client-side sorting/filtering) |
| `/feed.xml` | `feed.xml/+server.ts` | RSS 2.0 with iTunes namespace |
| `/audio/{filename}` | `audio/[filename]/+server.ts` | MP3 streaming with range request support |

### Home Assistant Integration

- **Ingress panel** — HA proxies requests to `/api/hassio_ingress/{addon_slug}/` → internal app at `:3400`
  - No external port exposure needed for the web UI
  - Authentication handled by HA itself

- **RSS for podcast clients** — Two options:
  1. **Port 3400 (recommended):** Enable in HA add-on Network settings, use `http://ha-ip:3400/feed.xml`
  2. **HA ingress URL:** Use `http://ha-ip:8123/api/hassio_ingress/ertecho_pod/feed.xml` + HA Long-Lived Access Token header

---

## Configuration

### Add-on Options (HA UI)

Set via Home Assistant UI → Settings → Add-ons → 10 Λεπτά Ακόμα → Configuration:

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `base_url` | string | `""` | Base URL for RSS enclosure links (e.g., `http://192.168.1.x:3400`). Leave empty if using HA ingress only. |

### Environment Variables (set by S6 run scripts)

| Variable | Value | Set by |
|----------|-------|--------|
| `DATABASE_PATH` | `/data/ertecho.db` | `rootfs/etc/s6-overlay/s6-rc.d/web/run` |
| `AUDIO_DIR` | `/share/ertecho-pod` | `rootfs/etc/s6-overlay/s6-rc.d/scraper/run` |
| `PUBLIC_BASE_URL` | Value of `base_url` option or `""` | `rootfs/etc/s6-overlay/s6-rc.d/web/run` |
| `PORT` | `3400` | `config.yaml` |
| `NODE_ENV` | `production` | S6 run scripts |

### Storage Locations

| Path | Owner | Persists | Purpose |
|------|-------|----------|---------|
| `/share/ertecho-pod/` | HA supervisor | ✓ Yes | MP3 files (visible in HA file browser / Samba) |
| `/data/ertecho.db` | HA supervisor | ✓ Yes | SQLite database (add-on private) |
| `/var/log/` | S6 overlay | ✗ Restart-only | Process logs (tail via `ha logs`) |

---

## External Dependencies

### ertecho.gr WordPress REST API

**Base URL:** `https://www.ertecho.gr/wp-json/wp/v2`

#### Podcast Posts
```
GET /podcast?search=10+λεπτα+ακομα&per_page=100&page={N}
```
Returns paginated list of posts with ACF fields:
```json
{
  "id": 12345,
  "date": "2026-04-22T20:00:00",
  "title": { "rendered": "10 Λεπτά Ακόμα — 22 Απριλίου 2026" },
  "excerpt": { "rendered": "<p>Episode description...</p>" },
  "acf": {
    "audio_file": 67890,
    "duration_in_seconds": 600
  }
}
```

#### Media Object (MP3 metadata)
```
GET /media/{id}
```
Returns:
```json
{
  "id": 67890,
  "source_url": "https://ertecho-cdn.example.com/2026/04/episode.mp3",
  "media_details": {
    "filesize_in_bytes": 9876543,
    "length_formatted": "10:00"
  }
}
```

---

## Error Handling & Resilience

### Network Failures
- **Scraper HTTP requests** — 30-second timeout, max 5 redirects
- **Failed downloads** — Episode record created, `downloaded = 0`; retry on next scheduled run
- **API pagination errors** — Log and continue (partial sync better than total failure)

### Database
- **WAL mode** — Enables concurrent reads during writes, crash-safe
- **UNIQUE constraints** — `wp_post_id` prevents duplicate downloads from repeated runs

### Web Server
- **Missing files** — 404 with user-friendly message ("Το αρχείο δεν έχει ληφθεί ακόμα")
- **Empty database** — UI shows "Δεν βρέθηκαν επεισόδια" prompt

---

## Development Notes

### Code Organization

| Path | Purpose |
|------|---------|
| `src/lib/db.ts` | Database initialization, typed query helpers |
| `src/lib/types.ts` | TypeScript interfaces for Episode, WpPost, WpMedia |
| `src/hooks.server.ts` | `initSchema()` called on app startup |
| `src/routes/feed.xml/+server.ts` | RSS 2.0 generation logic |
| `src/routes/audio/[filename]/+server.ts` | HTTP streaming with range requests |
| `scripts/scraper.ts` | API pagination, download logic, cron scheduling |
| `rootfs/etc/s6-overlay/` | S6 service definitions (process supervision) |
| `config.yaml` | HA add-on manifest (ports, options schema, ingress) |
| `build.yaml` | Multi-arch Docker build config |

### Local Development vs. Production

**Local dev** (`docker compose up`):
- Uses `node:22-alpine` as base (faster builds)
- `AUDIO_DIR` = `./audio/` (local volume)
- `DATABASE_PATH` = `/data/ertecho.db` (Docker volume)

**Home Assistant deployment**:
- Uses HA official base image (per architecture)
- `AUDIO_DIR` = `/share/ertecho-pod` (HA shared storage, visible to all add-ons)
- `DATABASE_PATH` = `/data/ertecho.db` (HA private storage, add-on only)

---

## Performance Considerations

### Initial Sync
- First run downloads **all** existing episodes (may take 5–10 minutes depending on network)
- Progress logged to `/run/service/scraper/log/main/current`
- Safe to interrupt; upsert logic ensures no duplicates on retry

### Scheduled Runs
- Runs every weekday at 21:00 Athens time (~30 seconds for 1–2 new episodes)
- Does not block the web server (separate process)
- Failed downloads don't halt the scheduler

### Database
- SQLite with WAL mode handles concurrent reads during writes
- No explicit pagination in the app (all episodes loaded into memory)
  - Acceptable because EP count is typically < 200–300
  - If scaling to 1000+ episodes, implement server-side pagination in `+page.server.ts`

### MP3 Streaming
- HTTP range requests (`Range: bytes=0-1023`) supported
- Enables fast-forward/rewind in podcast clients and browsers
