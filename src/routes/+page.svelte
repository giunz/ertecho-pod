<script lang="ts">
  import type { PageData } from './$types.js';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const episodes = $derived(data.episodes);

  // Track which episode descriptions are expanded
  let expanded = $state<Record<number, boolean>>({});

  function toggleDesc(id: number) {
    expanded[id] = !expanded[id];
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('el-GR', {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function formatDuration(secs: number | null): string {
    if (!secs) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function stripHtml(html: string | null): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').trim();
  }
</script>

<svelte:head>
  <title>10 Λεπτά Ακόμα — Αρχείο Επεισοδίων</title>
</svelte:head>

<div class="container">
  <div class="page-heading">
    <h1>Αρχείο Επεισοδίων</h1>
    <p class="subtitle">
      {episodes.length} επεισόδια · εκπομπή «10 Λεπτά Ακόμα» από το ERTecho
    </p>
  </div>

  {#if episodes.length === 0}
    <div class="empty-state">
      <h2>Δεν βρέθηκαν επεισόδια</h2>
      <p>Εκτελέστε τον scraper για να κατεβάσετε τα επεισόδια.</p>
    </div>
  {:else}
    <ul class="episodes-list" style="list-style:none">
      {#each episodes as ep (ep.id)}
        <li class="episode-card">
          <div class="episode-header">
            <span class="episode-title">{ep.title}</span>
            <div class="episode-meta">
              <span class="episode-date">{formatDate(ep.published_at)}</span>
              {#if ep.duration_seconds}
                <span class="episode-duration">{formatDuration(ep.duration_seconds)}</span>
              {/if}
            </div>
          </div>

          <div class="audio-row">
            {#if ep.downloaded && ep.filename}
              <audio controls preload="none" src="/audio/{ep.filename}">
                Ο browser σας δεν υποστηρίζει audio.
              </audio>
              <a
                class="download-btn"
                href="/audio/{ep.filename}"
                download={ep.filename}
                title="Λήψη MP3"
              >
                ↓ MP3
              </a>
            {:else}
              <span class="not-downloaded">Το αρχείο δεν έχει ληφθεί ακόμα.</span>
            {/if}
          </div>

          {#if ep.description}
            {@const clean = stripHtml(ep.description)}
            {#if clean}
              <button class="desc-toggle" onclick={() => toggleDesc(ep.id)}>
                {expanded[ep.id] ? '▲ Απόκρυψη περιγραφής' : '▼ Εμφάνιση περιγραφής'}
              </button>
              {#if expanded[ep.id]}
                <p class="episode-description desc-text">{clean}</p>
              {/if}
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
