import { initSchema } from '$lib/db.js';

// Create DB table once at startup
initSchema();
console.log('[db] Schema ready');

export const handle = async ({ event, resolve }) => {
  return resolve(event);
};
