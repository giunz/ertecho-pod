import { getEpisodes } from '$lib/db.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = () => {
  const episodes = getEpisodes();
  return {
    episodes: episodes.map((ep) => ({
      ...ep,
      published_at: ep.published_at instanceof Date ? ep.published_at.toISOString() : ep.published_at,
      created_at: ep.created_at instanceof Date ? ep.created_at.toISOString() : ep.created_at
    }))
  };
};
