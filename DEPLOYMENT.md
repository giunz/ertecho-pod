# Deployment & Operations Guide

## Installation on Home Assistant

### Step 1: Add Repository

1. Open **Settings** → **Add-ons** → **Add-on Store** (⋮ menu) → **Repositories**
2. Paste repository URL: `https://github.com/giunz/ertecho-pod`
3. Close the dialog (the repo is now registered)

### Step 2: Install Add-on

1. Open **Add-on Store** → search for **"10 Λεπτά Ακόμα"**
2. Click the add-on card
3. Click **Install**
4. Wait for the download and build to complete (1–5 minutes depending on your hardware)

### Step 3: Configure

1. Go to the add-on's **Configuration** tab
2. Set `base_url` if needed:
   - **For ingress only** (no external access): Leave empty
   - **For podcast clients with port mapping**: Set to `http://<your-ha-ip>:3400`
     - Example: `http://192.168.1.100:3400`

3. Click **Save**

### Step 4: Start

1. Go to the **Info** tab
2. Click **Start**
3. Check the **Logs** tab to monitor startup progress

---

## First Run

On first startup, the add-on will:

1. **Initialize the database** (< 1 second)
2. **Full sync from ertecho.gr** (5–10 minutes)
   - Fetches all available episodes
   - Downloads all MP3 files
   - Populates the database
3. **Switch to daily schedule** (weekdays 21:00 Athens time)

You can monitor progress in the **Logs** tab:

```
2026-04-22 20:05:10 [web] SvelteKit server started on port 3400
2026-04-22 20:05:12 [scraper] Starting full sync...
2026-04-22 20:05:14 [scraper] Fetching page 1 of episodes...
2026-04-22 20:10:00 [scraper] Downloaded 45 episodes, scheduled for weekdays at 21:00 Athens time
```

---

## Accessing the App

### Web UI (via Home Assistant Sidebar)

After starting, the add-on appears in the HA sidebar as **"10 Λεπτά Ακόμα"** under **Developer Tools** or custom panel.

- No extra port configuration needed
- Authentication handled by Home Assistant
- Fully private to your Home Assistant instance

### Podcast Clients (Podcast Addict, AntennaPod, etc.)

Two options:

#### Option 1: Direct Port Access (Recommended for Local Network)

1. Go to the add-on's **Network** tab
2. Toggle **Port 3400** to enable external access
3. Set `base_url` in **Configuration** to your HA IP:
   ```
   http://192.168.1.100:3400
   ```
4. In your podcast client, add feed URL:
   ```
   http://192.168.1.100:3400/feed.xml
   ```

**Pros:** Simple, works offline
**Cons:** Exposes add-on to your local network

#### Option 2: Home Assistant Ingress (Advanced)

Use Home Assistant's proxy:

1. Leave `base_url` empty (or unset)
2. In your podcast client, add:
   ```
   http://<ha-ip>:8123/api/hassio_ingress/ertecho_pod/feed.xml
   ```
3. Add a **HTTP header** (supported by advanced clients like AntennaPod):
   ```
   Authorization: Bearer {your-long-lived-access-token}
   ```

**Pros:** No extra port exposure, routed through HA auth
**Cons:** Requires manual header config (not all clients support it)

---

## Configuration Options

### `base_url` Option

**Default:** (empty string)

**Usage:**
- RSS feed enclosure URLs (MP3 download links) will use this prefix
- Example: if `base_url` = `http://192.168.1.100:3400`, then RSS enclosures point to:
  ```xml
  <enclosure url="http://192.168.1.100:3400/audio/20260422-dekalepta.mp3" />
  ```

**When to set:**
- ✓ Set if using external podcast clients
- ✓ Set if accessing from outside your local network (using reverse proxy)
- ✗ Leave empty if only using the web UI via Home Assistant sidebar

**Example values:**
```
http://192.168.1.100:3400
http://ertecho.example.com
https://ha.example.com:8123/api/hassio_ingress/ertecho_pod
```

---

## Monitoring & Logs

### Real-time Logs

**Web UI:** Go to the add-on's **Logs** tab to see live output

**CLI (if SSH add-on installed):**
```bash
ha logs addon_ertecho_pod -f
```

### Log Levels

- **INFO** (default) — Normal operation messages
- **ERROR** — Failures (network errors, file write failures)
- **WARNING** — Unexpected conditions (timeouts, retries)

### Common Log Messages

```
[web] SvelteKit server started on port 3400
→ Web server is ready; UI accessible via Home Assistant sidebar

[scraper] Fetching episodes from ertecho.gr...
→ Scraper started (either on schedule or after restart)

[scraper] Downloaded 2 new episodes
→ Success; 2 new MP3s were fetched and saved

[scraper] Episode 12345 already exists, skipping
→ Normal; episode previously downloaded

ERROR: Failed to download http://... (HTTP 404)
→ ertecho.gr returned 404; may be due to deleted episode

[scraper] Next run scheduled for 2026-04-25 21:00:00
→ Cron schedule confirmed for next weekday
```

---

## Storage & Backups

### Storage Locations

| Path | Size | Contents | Accessible |
|------|------|----------|-----------|
| `/share/ertecho-pod/` | ~1–10 GB (depends on # episodes) | MP3 files | ✓ Yes (HA file browser / Samba) |
| `/data/ertecho.db` | ~1 MB | SQLite database | ✗ No (add-on private) |

### Backing Up

**Backup episodes (manual):**
1. Open Home Assistant **Settings** → **System** → **Storage** → **Samba**
2. Enable Samba if not already done
3. Connect from your computer:
   - **Windows:** `\\<ha-ip>\share\ertecho-pod`
   - **macOS/Linux:** `smb://<ha-ip>/share/ertecho-pod`
4. Copy `ertecho-pod` folder to external drive

**Automatic backups:**
- Home Assistant's native backup feature **does not** include `/share/` (only `/config/`)
- To automate: use a separate NAS backup tool (e.g., Synology, TrueNAS) or third-party backup add-on

**Database backup (via SSH):**
```bash
ha addons logs ertecho_pod > /share/ertecho-pod/ertecho.db.backup
```

---

## Troubleshooting

### Add-on Won't Start

**Symptom:** "Error starting add-on" in the UI

**Steps:**
1. Check **Logs** tab for error messages
2. Common causes:
   - **Insufficient disk space:** Check HA Storage settings
   - **Port 3400 already in use:** Stop conflicting add-on or change port
   - **Missing base image:** Rebuild (click Install again)

**Solution:**
```bash
# Via SSH add-on (if installed):
ha addons restart ertecho_pod
# Check logs:
ha logs addon_ertecho_pod
```

### Scraper Not Running

**Symptom:** Episodes not updating on schedule

**Steps:**
1. Check **Logs** — does it show "Fetching episodes..."?
2. Manually trigger:
   - **Via SSH:** Connect and restart the add-on
   - **Via Web UI:** Stop and start the add-on
3. Check network:
   ```bash
   # Via SSH, ping ertecho.gr
   ping www.ertecho.gr
   ```

**Common causes:**
- **Network issue:** HA can't reach ertecho.gr
- **Timezone misconfiguration:** Cron schedule may be in the wrong timezone
  - Verify HA Settings → System → General → Time Zone is set to `Europe/Athens`
- **Addon restarted during scheduled run:** Brief interruption is okay; next run will retry

---

### RSS Feed Returns 404

**Symptom:** Podcast client can't download the feed

**Steps:**
1. Test URL directly:
   ```bash
   curl http://<ha-ip>:3400/feed.xml
   # Should return XML starting with <?xml version="1.0"...
   ```

2. Check port access:
   - Confirm **Port 3400** is enabled in the add-on's **Network** tab
   - Test: `curl -I http://<ha-ip>:3400/`

3. Check `base_url`:
   - If set, verify it matches your actual IP/domain
   - If using external domain, ensure DNS resolves correctly

**Fix:**
- Ensure `base_url` is set to the IP/domain you're accessing from
- For local network: `http://192.168.1.x:3400`
- For external: use a reverse proxy or HA ingress URL

### No Episodes in Web UI

**Symptom:** "Δεν βρέθηκαν επεισόδια" (No episodes found)

**Steps:**
1. Check **Logs** — did scraper complete?
2. Wait 10–15 minutes (first sync takes time)
3. Manually trigger scraper:
   - Stop and restart the add-on

**Common causes:**
- **First run in progress:** Wait for initial sync to complete
- **Network connectivity:** HA cannot reach ertecho.gr
- **Database corruption:** Unlikely, but possible after power failure

**Recovery:**
```bash
# Via SSH (if installed), remove database to force rebuild:
ha shell
rm /share/ertecho-pod/.../ertecho.db  # Check actual path in logs
# Then restart add-on
```

### Audio Playback Fails

**Symptom:** Web UI loads, but audio player shows "Error loading audio"

**Steps:**
1. Check browser console (F12 → Console tab) for network errors
2. Verify file exists:
   - Check HA file browser under `/share/ertecho-pod/`
   - Look for `.mp3` files with names like `20260422-dekalepta.mp3`

**Common causes:**
- **File didn't download:** Check scraper logs
- **Wrong filename:** Verify the episode was marked as `downloaded = 1` in database
- **Network timeout:** Very large files (10+ MB) may timeout

**Fix:**
1. Re-download missing episodes: Restart add-on (triggers full sync if `downloaded = 0`)
2. If specific file is corrupt, delete it and restart

---

### High CPU/Memory Usage

**Symptom:** Home Assistant becomes slow when add-on runs

**Causes:**
- **Scraper downloading large files:** Normal during first sync; wait 10–15 minutes
- **Web UI loading all episodes:** Typical for < 200 episodes

**Monitor:**
- Open add-on **System** tab (if available) to see resource usage
- Check HA **Settings** → **System** → **System Monitor** for overall usage

**Optimize:**
- Reduce frequency: Edit cron schedule in `scripts/scraper.ts` (if self-hosting)
- Add more RAM to HA if possible

---

### Database Corruption

**Symptom:** "database disk image is malformed" in logs

**Causes:**
- Power failure during database write
- Disk full / I/O error
- Rare SQLite edge case

**Recovery:**
```bash
# Via SSH:
# 1. Stop the add-on (pauses all processes)
# 2. Remove corrupted database
rm /data/ertecho.db
# 3. Restart add-on (will rebuild from ertecho.gr)
```

---

## Network Configuration

### Port Mapping for Podcast Clients

**Scenario:** You want to add the podcast feed to Podcast Addict on your phone

1. **Enable port in HA:**
   - Go to add-on's **Network** tab
   - Find "Port 3400" and toggle it on
   - Note: This exposes the port to your local network

2. **Get your HA IP:**
   - Settings → System → About → Local IP (e.g., `192.168.1.100`)

3. **Set `base_url` in config:**
   - Go to add-on's **Configuration** tab
   - Set `base_url` to: `http://192.168.1.100:3400`

4. **Add to podcast client:**
   - Feed URL: `http://192.168.1.100:3400/feed.xml`
   - Test with: `curl http://192.168.1.100:3400/feed.xml`

### Reverse Proxy (Advanced)

To expose the add-on securely over the internet:

1. **Set up reverse proxy** (nginx, Caddy, HA add-on):
   ```nginx
   location /ertecho/ {
     proxy_pass http://192.168.1.100:3400/;
   }
   ```

2. **Update `base_url`:**
   ```
   https://example.com/ertecho
   ```

3. **Add to podcast client:**
   ```
   https://example.com/ertecho/feed.xml
   ```

---

## Maintenance

### Regular Tasks

| Task | Frequency | Purpose |
|------|-----------|---------|
| Check **Logs** | Weekly | Catch errors early |
| Verify episodes update | Weekly | Ensure scraper is working |
| Back up `/share/ertecho-pod/` | Monthly | Prevent data loss |
| Check storage usage | Monthly | Avoid filling disk |

### Update Add-on

Home Assistant will notify you when updates are available:

1. Go to **Add-ons** → **10 Λεπτά Ακόμα**
2. Click **Update** if available
3. The add-on will stop, update, and restart automatically
4. No data loss (database and files are preserved)

### Uninstall

1. Go to **Add-ons** → **10 Λεπτά Ακόμα**
2. Click **Uninstall**
3. Remove repository:
   - **Settings** → **Add-ons** → **Add-on Store** (⋮) → **Repositories**
   - Remove the ertecho-pod repository

---

## Resources

- **Home Assistant Official Docs:** https://www.home-assistant.io/docs/
- **Home Assistant Add-on Development:** https://developers.home-assistant.io/docs/add_ons/
- **Podcast Standards:** https://www.rfc-editor.org/rfc/rfc4287 (Atom), https://www.rssboard.org/rss-specification (RSS 2.0)
- **Podcast Clients:**
  - Podcast Addict (Android): https://github.com/AntennaPod/AntennaPod
  - AntennaPod (Android): https://antennapod.org/
  - Apple Podcasts (iOS/macOS): https://www.apple.com/podcasts/
  - Pocket Casts (Cross-platform): https://www.pocketcasts.com/

---

## Support & Troubleshooting

### Getting Help

1. **Check logs** first (90% of issues are visible there)
2. **Consult this guide** — common issues are documented above
3. **Report an issue:** https://github.com/giunz/ertecho-pod/issues
   - Include:
     - Error message from logs
     - Home Assistant version
     - Add-on version
     - Reproduction steps
