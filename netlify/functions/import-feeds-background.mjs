// Background function (up to 15 minutes): imports every partner feed listed in the
// FEEDS environment variable. Started daily by import-feeds.mjs; protected by IMPORT_SECRET.
import { getDatabase } from '@netlify/database';
import { runConfiguredFeeds } from '../../lib/feeds.mjs';

export default async (req) => {
  const secret = Netlify.env.get('IMPORT_SECRET');
  if (!secret || req.headers.get('x-import-secret') !== secret) return new Response('Forbidden', { status: 403 });
  const db = getDatabase();
  const results = await runConfiguredFeeds(async (text, params) => (await db.pool.query(text, params)).rows, Netlify.env.get('FEEDS'));
  console.log('Feed import finished', JSON.stringify(results));
};

export const config = { background: true };
