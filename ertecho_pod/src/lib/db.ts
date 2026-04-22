import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Episode } from './types.js';

const DB_PATH = process.env.DATABASE_PATH ?? '/data/ertecho.db';

// Ensure parent directory exists before opening
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

export function initSchema(): void {
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

function rowToEpisode(row: Record<string, unknown>): Episode {
  return {
    ...row,
    downloaded: Boolean(row.downloaded),
    published_at: new Date(row.published_at as string),
    created_at: new Date(row.created_at as string)
  } as Episode;
}

export function getEpisodes(): Episode[] {
  return (db.prepare('SELECT * FROM episodes ORDER BY published_at DESC').all() as Record<string, unknown>[]).map(rowToEpisode);
}

export function getEpisode(id: number): Episode | null {
  const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToEpisode(row) : null;
}

export function upsertEpisode(episode: {
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
    wp_post_id: episode.wp_post_id,
    wp_media_id: episode.wp_media_id,
    title: episode.title,
    description: episode.description,
    published_at: episode.published_at.toISOString(),
    duration_seconds: episode.duration_seconds,
    file_size: episode.file_size,
    source_url: episode.source_url
  });

  const row = db.prepare('SELECT id, downloaded, filename FROM episodes WHERE wp_post_id = ?')
    .get(episode.wp_post_id) as { id: number; downloaded: number; filename: string | null };

  return { id: row.id, downloaded: Boolean(row.downloaded), filename: row.filename };
}

export function markDownloaded(id: number, filename: string): void {
  db.prepare('UPDATE episodes SET downloaded = 1, filename = ? WHERE id = ?').run(filename, id);
}
