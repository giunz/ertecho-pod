<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<svelte:head>
  <title>10 Λεπτά Ακόμα — ERTecho</title>
  <meta name="description" content="Αρχείο επεισοδίων της εκπομπής «10 Λεπτά Ακόμα» από το ERTecho." />
</svelte:head>

<header class="site-header">
  <a href="/" class="brand" style="text-decoration:none">
    10 Λεπτά Ακόμα<span class="dot"> •</span>
  </a>
  <a href="/feed.xml" class="rss-link" title="Podcast RSS Feed">
    <svg class="rss-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
    </svg>
    RSS Feed
  </a>
</header>

<main>
  {@render children()}
</main>
