import { getEpisodes } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string | null): string {
  if (!html) return '';
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

function formatItunesDuration(secs: number | null): string {
  if (!secs) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GET: RequestHandler = ({ url }) => {
  const baseUrl = process.env.PUBLIC_BASE_URL ?? `${url.protocol}//${url.host}`;
  const episodes = getEpisodes();

  const downloadedEpisodes = episodes.filter((ep) => ep.downloaded && ep.filename);

  const items = downloadedEpisodes
    .map((ep) => {
      const audioUrl = `${baseUrl}/audio/${ep.filename}`;
      const pubDate = new Date(ep.published_at).toUTCString();
      const description = escapeXml(stripHtml(ep.description));
      const title = escapeXml(ep.title);
      const guid = `${baseUrl}/episodes/${ep.wp_post_id}`;

      return `
    <item>
      <title>${title}</title>
      <description>${description}</description>
      <itunes:summary>${description}</itunes:summary>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <enclosure url="${escapeXml(audioUrl)}" type="audio/mpeg"${ep.file_size ? ` length="${ep.file_size}"` : ''} />
      ${ep.duration_seconds ? `<itunes:duration>${formatItunesDuration(ep.duration_seconds)}</itunes:duration>` : ''}
    </item>`;
    })
    .join('\n');

  const feedUrl = `${baseUrl}/feed.xml`;
  const now = new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>10 Λεπτά Ακόμα — ERTecho</title>
    <link>${baseUrl}</link>
    <description>Η εκπομπή «10 Λεπτά Ακόμα» από το ERTecho. Αρχείο επεισοδίων.</description>
    <language>el</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <itunes:author>ERTecho</itunes:author>
    <itunes:category text="News" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:owner>
      <itunes:name>ERTecho</itunes:name>
    </itunes:owner>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
