// Import a feed file into the local development database (the one `npm start` uses).
// Usage: npm run import-feed -- --name "Agency name" --file listings.xml [--format kyero|csv]
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { NetlifyDB } from '@netlify/database-dev';
import { importFeed } from '../lib/feeds.mjs';

const { values } = parseArgs({ options: { name: { type: 'string' }, file: { type: 'string' }, format: { type: 'string' } } });
if (!values.name || !values.file) {
  console.error('Usage: npm run import-feed -- --name "Agency name" --file listings.xml [--format kyero|csv]');
  process.exit(1);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new NetlifyDB({ directory: path.join(root, 'data', 'db'), logger: () => {} });
await db.start();
await db.applyMigrations(path.join(root, 'netlify', 'database', 'migrations'));
const stats = await importFeed(async (t, p) => (await db.query(t, p)).rows, {
  name: values.name, body: await fs.readFile(values.file, 'utf8'), format: values.format,
});
console.log(stats);
await db.stop();
