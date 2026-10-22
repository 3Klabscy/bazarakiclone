import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { createApi } from '../../lib/api.mjs';

const db = getDatabase();

const handle = createApi({
  query: async (text, params) => (await db.pool.query(text, params)).rows,
  photos: getStore({ name: 'ad-photos', consistency: 'strong' }),
});

export default (req) => handle(req);

export const config = { path: ['/api/*', '/uploads/*'] };
