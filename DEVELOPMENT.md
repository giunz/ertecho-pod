# Development Guide

## Prerequisites

- **Node.js** 22+ (LTS)
- **npm** 10+
- **Docker** (for full integration testing; optional for web-only dev)
- **Git**

---

## Local Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/giunz/ertecho-pod.git
cd ertecho-pod
npm install
```

### 2. Create `.env` for Local Testing

Copy `.env.example` and customize for your environment:

```bash
cp .env.example .env
```

Example `.env`:
```bash
# Database (will be created automatically)
DATABASE_PATH=./data/ertecho.db

# Audio storage
AUDIO_DIR=./audio

# Web server
PORT=3400
PUBLIC_BASE_URL=http://localhost:3400

# Node environment
NODE_ENV=development
```

---

## Development Workflows

### Web UI Development

```bash
npm run dev
```

Starts **SvelteKit dev server** on `http://localhost:5173`:
- Hot module replacement (HMR) for instant feedback
- TypeScript checking via `svelte-check`
- Database access via `src/lib/db.ts` helpers

**Accessing the UI:**
- Open `http://localhost:5173` in your browser
- The page loads episodes from the local SQLite database
- No RSS feed available in dev mode (only in `npm run build` + `npm run preview`)

### Database Population (for UI testing)

To populate the database with test episodes:

```bash
# Run scraper once (fetches from ertecho.gr and downloads all episodes)
npm run scrape

# Or run with cron scheduling (for testing scheduled runs)
npm run scrape:schedule
```

The scraper will:
1. Query ertecho.gr WordPress API for "10 λεπτα ακομα"
2. Download all MP3 files to `./audio/`
3. Populate `./data/ertecho.db` with episode metadata

**Database inspection:**
```bash
# Install sqlite3 CLI if not present
# macOS: brew install sqlite3
# Ubuntu: apt-get install sqlite3

# Connect to the dev database
sqlite3 data/ertecho.db

# Example queries
sqlite> SELECT COUNT(*) FROM episodes;
sqlite> SELECT title, published_at, downloaded FROM episodes ORDER BY published_at DESC LIMIT 5;
sqlite> .schema episodes
```

---

## Docker Development

For testing the full add-on environment locally (without Home Assistant):

```bash
# Build and start
docker compose up

# The app starts with:
# - SvelteKit web server on port 3400
# - Scraper with cron scheduling
# - SQLite database in Docker volume
```

**Access the app:**
- Web UI: `http://localhost:3400`
- RSS feed: `http://localhost:3400/feed.xml`
- Audio streaming: `http://localhost:3400/audio/{filename}`

**View logs:**
```bash
docker compose logs -f app
```

**Rebuild and restart:**
```bash
docker compose up --build
```

---

## Building for Production

### SvelteKit Build

```bash
npm run build
```

Outputs optimized bundle to `./build/`:
- Minified JavaScript
- Stripped source maps
- Production dependencies only

### Preview Production Build

```bash
npm run preview
```

Runs the production build locally on `http://localhost:5173`:
- Tests the exact bundle that will ship
- RSS feed available at `/feed.xml`
- No hot reload (rebuild required to see changes)

### Docker Multi-Arch Build

The `build.yaml` defines multi-architecture builds for Home Assistant:

```bash
# (Home Assistant build service handles this automatically)
# For manual testing:
docker buildx build \
  --platform linux/amd64,linux/arm/v7,linux/arm64 \
  --tag ghcr.io/giunz/ertecho-pod:latest \
  .
```

---

## Code Structure

### Key Files

| Path | Purpose | Notes |
|------|---------|-------|
| `src/lib/db.ts` | Database singleton + query helpers | Typed wrappers around `better-sqlite3` |
| `src/lib/types.ts` | TypeScript interfaces | Episode, WpPost, WpMedia types |
| `src/hooks.server.ts` | App initialization | Runs `initSchema()` on startup |
| `src/routes/+layout.svelte` | Page layout & styling | CSS, header, footer |
| `src/routes/+page.server.ts` | Server-side data loading | Fetches episodes from DB |
| `src/routes/+page.svelte` | UI component | Episode list, audio players, descriptions |
| `src/routes/feed.xml/+server.ts` | RSS feed generation | RSS 2.0 with iTunes namespace |
| `src/routes/audio/[filename]/+server.ts` | Audio streaming | HTTP range request support |
| `scripts/scraper.ts` | Episode scraper & scheduler | Fetch WP API, download MP3s, cron |

### Data Flow

```
+page.server.ts
  ↓ calls db.getEpisodes()
src/lib/db.ts
  ↓ executes SELECT query
SQLite (./data/ertecho.db)
  ↓ returns Episode[]
+page.svelte
  ↓ renders list with <audio> tags
Browser
  ↓ user clicks play
audio/[filename]/+server.ts
  ↓ streams /share/ertecho-pod/{filename}
Browser audio player
```

---

## Testing

### Type Checking

```bash
npm run check          # One-time check
npm run check:watch    # Watch mode
```

Uses `svelte-check` to verify TypeScript and Svelte component types.

### Manual Testing Checklist

**Web UI:**
- [ ] Episode list loads and displays all episodes
- [ ] Episodes are sorted newest first
- [ ] Audio player works (play, pause, seek)
- [ ] Download button downloads the MP3
- [ ] Description toggle shows/hides text
- [ ] Greek text displays correctly (UTF-8)
- [ ] Responsive on mobile (narrow viewport)

**Scraper:**
- [ ] `npm run scrape` completes without errors
- [ ] New episodes appear in the database
- [ ] MP3 files exist in `./audio/`
- [ ] No duplicate downloads on repeated runs
- [ ] `npm run scrape:schedule` prints cron schedule and exits cleanly

**RSS Feed:**
- [ ] `http://localhost:3400/feed.xml` returns valid XML
- [ ] Feed title and description are present
- [ ] Each item has title, link, pubDate, enclosure (MP3 URL)
- [ ] Enclosure `url` uses `PUBLIC_BASE_URL` setting
- [ ] iTunes namespace tags are present (duration, author)

**Audio Streaming:**
- [ ] `curl -I http://localhost:3400/audio/{filename}` returns 200
- [ ] Range requests work: `curl -H 'Range: bytes=0-1023' http://localhost:3400/audio/{filename}`
- [ ] Missing file returns 404

---

## Debugging

### Enable Debug Logging

Set environment variables:

```bash
# Node.js debug (SvelteKit)
DEBUG=sveltekit:* npm run dev

# Custom app logging (add to scripts as needed)
export DEBUG=ertecho-pod:*
npm run scrape
```

### Database Debugging

```bash
# Open SQL shell
sqlite3 ./data/ertecho.db

# Inspect schema
.schema

# Check for issues
.tables
SELECT COUNT(*) FROM episodes;
SELECT * FROM episodes WHERE downloaded = 0;  -- Check failed downloads
```

### Scraper Debugging

The scraper logs to stdout. For detailed inspection:

```bash
npm run scrape 2>&1 | tee scraper.log

# Or with line buffering for real-time inspection:
npm run scrape 2>&1 | grep --line-buffered .
```

### Memory / Performance

```bash
# Monitor Node process
node --expose-gc build/index.js
# Interact with app in browser, then:
# Press Ctrl+C to capture heap snapshot (if enabled)
```

---

## Common Tasks

### Add a New Episode Field

1. **Database schema** — Update `src/lib/db.ts`:
   ```typescript
   export interface Episode {
     // ... existing fields
     new_field: string | null;
   }
   ```

2. **Create migration** — Add `ALTER TABLE` to `initSchema()`:
   ```typescript
   db.exec(`ALTER TABLE episodes ADD COLUMN new_field TEXT;`);
   ```

3. **Update scraper** — Parse from ertecho.gr API response in `scripts/scraper.ts`

4. **Update UI** — Display in `src/routes/+page.svelte`

### Change Podcast Schedule

Edit `scripts/scraper.ts`:
```typescript
// Current: weekdays at 21:00 Athens time
cron.schedule('0 21 * * 1-5', async () => {
  // Change to daily at 10:00:
  // '0 10 * * *'
```

Cron format: `minute hour day-of-month month day-of-week`
(See [node-cron docs](https://github.com/node-cron/node-cron))

### Modify RSS Feed Template

Edit `src/routes/feed.xml/+server.ts`:
- Add/remove `<item>` fields
- Change iTunes namespace tags
- Update channel description

---

## Troubleshooting

### Port Already in Use

```bash
# If port 3400 is taken:
lsof -i :3400              # Find process
kill -9 <PID>              # Kill it
# Or change PORT in .env
PORT=3401 npm run preview
```

### Database Locked

```bash
# If "database is locked" error:
rm -f ./data/ertecho.db-wal ./data/ertecho.db-shm
# (Safe to do; SQLite WAL files are temporary checkpoints)
```

### Scraper Timeout

If `npm run scrape` times out:
1. Check internet connection
2. Verify ertecho.gr API is responding: `curl https://www.ertecho.gr/wp-json/wp/v2/podcast`
3. Check network speed (MP3 files are 5–10 MB each)
4. Increase timeout in `scripts/scraper.ts` (`req.setTimeout(60_000)`)

### UI Shows No Episodes

```bash
# Ensure database has records:
sqlite3 ./data/ertecho.db "SELECT COUNT(*) FROM episodes;"

# If 0 rows, run scraper:
npm run scrape
```

### RSS Feed Returns Empty

- Check `PUBLIC_BASE_URL` is set correctly in `.env`
- Verify episodes have `filename` in the database
- Test raw feed: `curl http://localhost:3400/feed.xml`

---

## Git Workflow

### Branch Naming

- Feature: `feature/your-feature-name`
- Bug fix: `fix/brief-description`
- Docs: `docs/topic`

### Commit Message Format

Keep commits atomic and descriptive:

```
type: short description (50 chars max)

Longer explanation if needed.
- List bullet points for changes
- One per line

Related issue: #123
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### Before Pushing

```bash
npm run check              # TypeScript + Svelte lint
npm run build              # Verify production build works
```

---

## Resources

- **SvelteKit:** https://kit.svelte.dev
- **Svelte:** https://svelte.dev
- **better-sqlite3:** https://github.com/WiseLibs/better-sqlite3
- **node-cron:** https://github.com/node-cron/node-cron
- **Home Assistant add-on docs:** https://developers.home-assistant.io/docs/add_ons
- **WordPress REST API:** https://developer.wordpress.org/rest-api/
