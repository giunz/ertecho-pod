#!/usr/bin/env tsx
/**
 * scraper.ts — Fetches episodes from ertecho.gr WordPress REST API,
 * downloads MP3 files, and upserts records into PostgreSQL.
 *
 * Usage:
 *   tsx scripts/scraper.ts              # run once
 *   tsx scripts/scraper.ts --schedule   # run now + schedule weekdays at 21:00 Athens
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import type { WpPost, WpMedia } from '../src/lib/types.js';

// ── Config ──────────────────────────────────────────────────────────────────

const AUDIO_DIR = process.env.AUDIO_DIR ?? '/app/audio';
const DB_PATH = process.env.DATABASE_PATH ?? '/data/ertecho.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const WP_BASE = 'https://www.ertecho.gr/wp-json/wp/v2';
const SEARCH_QUERY = '10 λεπτα ακομα';
const PER_PAGE = 100;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'ertecho-pod-scraper/1.0',
          Accept: 'application/json'
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    // Follow redirects manually (up to 5)
    function doGet(currentUrl: string, redirectsLeft: number) {
      const cu = new URL(currentUrl);
      const cl = cu.protocol === 'https:' ? https : http;
      const req = cl.get(
        currentUrl,
        { headers: { 'User-Agent': 'ertecho-pod-scraper/1.0' } },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              res.resume();
              return;
            }
            const next = new URL(res.headers.location, currentUrl).href;
            res.resume();
            doGet(next, redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} downloading ${currentUrl}`));
            res.resume();
            return;
          }
          const tmpPath = destPath + '.tmp';
          const file = fs.createWriteStream(tmpPath);
          res.pipe(file);
          file.on('finish', () => {
            file.close(() => {
              fs.renameSync(tmpPath, destPath);
              resolve();
            });
          });
          file.on('error', (err) => {
            fs.unlink(tmpPath, () => {});
            reject(err);
          });
          res.on('error', (err) => {
            fs.unlink(tmpPath, () => {});
            reject(err);
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(120_000, () => {
        req.destroy(new Error(`Timeout downloading ${currentUrl}`));
      });
    }

    doGet(url, 5);
    void client; // suppress unused warning
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ── DB helpers (inline — avoids importing SvelteKit $lib aliases) ────────────

function ensureSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      wp_post_id        INTEGER UNIQUE NOT NULL,
      wp_media_id       INTEGER,
      title             TEXT NOT NULL,
      description       TEXT,
      published_at      TEXT NOT NULL,
      duration_seconds  INTEGER,
      file_size         INTEGER,
      filename          TEXT UNIQUE,
      source_url        TEXT,
      downloaded        INTEGER DEFAULT 0,
      created_at        TEXT DEFAULT (datetime('now'))
    )
  `);
}

function upsertEpisode(ep: {
  wp_post_id: number;
  wp_media_id: number | null;
  title: string;
  description: string | null;
  published_at: Date;
  duration_seconds: number | null;
  file_size: number | null;
  source_url: string | null;
}): { id: number; downloaded: boolean; filename: string | null } {
  db.prepare(`
    INSERT INTO episodes
      (wp_post_id, wp_media_id, title, description, published_at, duration_seconds, file_size, source_url)
    VALUES
      (@wp_post_id, @wp_media_id, @title, @description, @published_at, @duration_seconds, @file_size, @source_url)
    ON CONFLICT(wp_post_id) DO UPDATE SET
      wp_media_id      = excluded.wp_media_id,
      title            = excluded.title,
      description      = excluded.description,
      published_at     = excluded.published_at,
      duration_seconds = excluded.duration_seconds,
      file_size        = excluded.file_size,
      source_url       = excluded.source_url
  `).run({
    wp_post_id: ep.wp_post_id,
    wp_media_id: ep.wp_media_id,
    title: ep.title,
    description: ep.description,
    published_at: ep.published_at.toISOString(),
    duration_seconds: ep.duration_seconds,
    file_size: ep.file_size,
    source_url: ep.source_url
  });

  const row = db.prepare('SELECT id, downloaded, filename FROM episodes WHERE wp_post_id = ?')
    .get(ep.wp_post_id) as { id: number; downloaded: number; filename: string | null };

  return { id: row.id, downloaded: Boolean(row.downloaded), filename: row.filename };
}

function markDownloaded(id: number, filename: string): void {
  db.prepare('UPDATE episodes SET downloaded = 1, filename = ? WHERE id = ?').run(filename, id);
}

// ── Fetch all posts (paginated) ──────────────────────────────────────────────

async function fetchAllPosts(): Promise<WpPost[]> {
  const all: WpPost[] = [];
  let page = 1;

  console.log('[scraper] Fetching episodes from ertecho.gr…');

  while (true) {
    const url =
      `${WP_BASE}/podcast?search=${encodeURIComponent(SEARCH_QUERY)}` +
      `&per_page=${PER_PAGE}&page=${page}&orderby=date&order=desc`;

    console.log(`[scraper]   Page ${page}…`);

    let posts: WpPost[];
    try {
      posts = await fetchJson<WpPost[]>(url);
    } catch (err) {
      console.error(`[scraper] Error fetching page ${page}:`, err);
      break;
    }

    if (!Array.isArray(posts) || posts.length === 0) break;

    all.push(...posts);
    console.log(`[scraper]   Got ${posts.length} posts (total so far: ${all.length})`);

    if (posts.length < PER_PAGE) break;
    page++;
  }

  console.log(`[scraper] Total posts fetched: ${all.length}`);
  return all;
}

// ── Resolve media URL ────────────────────────────────────────────────────────

async function resolveMedia(mediaId: number): Promise<WpMedia | null> {
  try {
    return await fetchJson<WpMedia>(`${WP_BASE}/media/${mediaId}`);
  } catch (err) {
    console.error(`[scraper] Could not resolve media ${mediaId}:`, err);
    return null;
  }
}

// ── Derive filename from URL or date ────────────────────────────────────────

function deriveFilename(sourceUrl: string, publishedAt: Date): string {
  const urlBasename = path.basename(new URL(sourceUrl).pathname);
  if (urlBasename.endsWith('.mp3')) return urlBasename;

  const y = publishedAt.getFullYear();
  const m = String(publishedAt.getMonth() + 1).padStart(2, '0');
  const d = String(publishedAt.getDate()).padStart(2, '0');
  return `${y}${m}${d}-dekalepta.mp3`;
}

// ── Main scrape run ──────────────────────────────────────────────────────────

async function runScrape(): Promise<void> {
  console.log(`\n[scraper] ── Run started at ${new Date().toISOString()} ──`);

  ensureSchema();
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const posts = await fetchAllPosts();
  if (posts.length === 0) {
    console.log('[scraper] No posts found, nothing to do.');
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const post of posts) {
    const title = stripHtml(post.title?.rendered ?? '');
    const description = post.excerpt?.rendered ?? null;
    const publishedAt = new Date(post.date);
    const mediaId = post.acf?.audio_file ?? null;
    const durationSeconds = post.acf?.duration_in_seconds ?? null;

    console.log(`\n[scraper] Processing: "${title}" (${post.date})`);

    // Resolve media if we have a media ID
    let sourceUrl: string | null = null;
    let fileSize: number | null = null;

    if (mediaId) {
      const media = await resolveMedia(mediaId);
      if (media) {
        sourceUrl = media.source_url;
        fileSize = media.media_details?.filesize_in_bytes ?? null;
      }
    }

    // Upsert episode metadata
    let dbRow: { id: number; downloaded: boolean; filename: string | null };
    try {
      dbRow = await upsertEpisode({
        wp_post_id: post.id,
        wp_media_id: mediaId,
        title,
        description,
        published_at: publishedAt,
        duration_seconds: durationSeconds,
        file_size: fileSize,
        source_url: sourceUrl
      });
    } catch (err) {
      console.error(`[scraper]   DB upsert failed for post ${post.id}:`, err);
      errors++;
      continue;
    }

    // Skip download if already done
    if (dbRow.downloaded && dbRow.filename) {
      const filePath = path.join(AUDIO_DIR, dbRow.filename);
      if (fs.existsSync(filePath)) {
        console.log(`[scraper]   Already downloaded: ${dbRow.filename}`);
        skipped++;
        continue;
      }
      // File missing on disk, re-download
      console.log(`[scraper]   File missing on disk, re-downloading…`);
    }

    if (!sourceUrl) {
      console.log(`[scraper]   No audio URL, skipping download.`);
      skipped++;
      continue;
    }

    const filename = deriveFilename(sourceUrl, publishedAt);
    const destPath = path.join(AUDIO_DIR, filename);

    console.log(`[scraper]   Downloading ${sourceUrl}`);
    console.log(`[scraper]   → ${destPath}`);

    try {
      await downloadFile(sourceUrl, destPath);
      await markDownloaded(dbRow.id, filename);
      console.log(`[scraper]   Done.`);
      downloaded++;
    } catch (err) {
      console.error(`[scraper]   Download failed:`, err);
      errors++;
    }
  }

  console.log(`\n[scraper] ── Run complete: ${downloaded} downloaded, ${skipped} skipped, ${errors} errors ──\n`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const schedule = args.includes('--schedule');

if (schedule) {
  // Run immediately, then schedule
  runScrape().catch((err) => console.error('[scraper] Fatal error:', err));

  // Weekdays (Mon–Fri) at 21:00 Europe/Athens
  const cronExpr = '0 21 * * 1-5';
  console.log(`[scraper] Scheduling cron: "${cronExpr}" (Europe/Athens)`);

  cron.schedule(
    cronExpr,
    () => {
      runScrape().catch((err) => console.error('[scraper] Scheduled run error:', err));
    },
    { timezone: 'Europe/Athens' }
  );

  console.log('[scraper] Scheduler active. Waiting for next trigger…');
} else {
  runScrape()
    .then(() => db.close())
    .catch((err) => {
      console.error('[scraper] Fatal error:', err);
      db.close();
      process.exit(1);
    });
}
