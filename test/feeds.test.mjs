import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NetlifyDB } from '@netlify/database-dev';
import { importFeed, mapCity, mapCategory, parseCsvRows, runConfiguredFeeds } from '../lib/feeds.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f) => fs.readFile(path.join(dir, 'fixtures', f), 'utf8');
let db, query;

test.before(async () => {
  db = new NetlifyDB({ logger: () => {} });
  await db.start();
  await db.applyMigrations(path.join(dir, '..', 'netlify', 'database', 'migrations'));
  query = async (t, p) => (await db.query(t, p)).rows;
});
test.after(() => db.stop());

test('maps towns and property types', () => {
  assert.strictEqual(mapCity('Germasogeia'), 'Limassol');
  assert.strictEqual(mapCity('', 'Pafos'), 'Paphos');
  assert.strictEqual(mapCity('Ayia Napa'), 'Famagusta');
  assert.strictEqual(mapCity('Atlantis'), null);
  assert.strictEqual(mapCategory('Penthouse', false), 'property--apartments-for-sale');
  assert.strictEqual(mapCategory('Detached villa', true), 'property--houses-for-rent');
  assert.strictEqual(mapCategory('Office', false), 'property--commercial-property');
  assert.strictEqual(mapCategory('Boat', false), null);
});

test('parses quoted CSV fields', () => {
  assert.deepStrictEqual(parseCsvRows('a,b\n"x, ""y""",z\r\n'), [['a', 'b'], ['x, "y"', 'z']]);
});

test('imports a Kyero feed, then updates and removes on the next run', async () => {
  const xml = await fixture('sample-kyero.xml');
  let stats = await importFeed(query, { name: 'Example Realty', body: xml });
  assert.deepStrictEqual([stats.imported, stats.updated, stats.skipped], [3, 0, 1]);
  assert.deepStrictEqual(stats.reasons, { 'unknown location': 1 });

  const [apt] = await query(`SELECT a.*, c.slug FROM ads a JOIN categories c ON c.id = a.category_id WHERE external_id = 'EX-1001'`);
  assert.strictEqual(apt.city, 'Limassol');
  assert.strictEqual(apt.slug, 'property--apartments-for-sale');
  assert.strictEqual(apt.title, '2-bedroom apartment in Germasogeia');
  assert.strictEqual(apt.images.length, 2);
  assert.strictEqual(apt.external_url, 'https://example.com/listings/EX-1001');
  assert.deepStrictEqual(apt.attributes, { bedrooms: 2, bathrooms: 2, area_m2: 96, reference: 'LIM-221' });
  const [villa] = await query(`SELECT a.*, c.slug FROM ads a JOIN categories c ON c.id = a.category_id WHERE external_id = 'EX-1002'`);
  assert.strictEqual(villa.slug, 'property--houses-for-rent');
  assert.strictEqual(villa.attributes.price_period, 'month');

  // Next day: the villa is gone from the feed and the apartment's price dropped.
  const next = xml.replace(/<property>\s*<id>EX-1002<\/id>[\s\S]*?<\/property>/, '').replace('285000', '279000');
  stats = await importFeed(query, { name: 'Example Realty', body: next });
  assert.deepStrictEqual([stats.imported, stats.updated, stats.removed], [0, 2, 1]);
  assert.strictEqual((await query(`SELECT status FROM ads WHERE external_id = 'EX-1002'`))[0].status, 'inactive');
  assert.strictEqual((await query(`SELECT price FROM ads WHERE external_id = 'EX-1001'`))[0].price, 279000);
  assert.strictEqual((await query(`SELECT COUNT(*)::int AS n FROM ads WHERE source_feed = 'Example Realty'`))[0].n, 3);

  // All of a feed's ads belong to one seller account named after the partner.
  const sellers = await query(`SELECT DISTINCT u.name FROM ads a JOIN users u ON u.id = a.user_id WHERE a.source_feed = 'Example Realty'`);
  assert.deepStrictEqual(sellers.map((s) => s.name), ['Example Realty']);
});

test('imports a CSV feed', async () => {
  const stats = await importFeed(query, { name: 'Example Lettings', body: await fixture('sample.csv') });
  assert.deepStrictEqual([stats.imported, stats.skipped], [2, 0]);
  const [shop] = await query(`SELECT * FROM ads WHERE external_id = 'C-1'`);
  assert.strictEqual(shop.city, 'Nicosia');
  assert.match(shop.description, /"prime" corner/);
  assert.strictEqual(shop.images.length, 2);
  const [house] = await query(`SELECT * FROM ads WHERE external_id = 'C-2'`);
  assert.strictEqual(house.title, '4-bedroom house in Paralimni');
  assert.strictEqual(house.city, 'Famagusta');
});

test('an empty or broken feed does not take ads down', async () => {
  await assert.rejects(importFeed(query, { name: 'Example Realty', body: '<root></root>' }), /No usable listings/);
  assert.strictEqual((await query(`SELECT status FROM ads WHERE external_id = 'EX-1001'`))[0].status, 'active');
  const [feed] = await query(`SELECT last_status FROM feeds WHERE name = 'Example Realty'`);
  assert.match(feed.last_status, /^error/);
});

test('configured feeds: a failing feed is reported without stopping the others', async () => {
  const feeds = JSON.stringify([
    { name: 'Broken Agency', url: 'https://example.com/broken.xml' },
    { name: 'Example Lettings', url: 'https://example.com/feed.csv', format: 'csv' },
  ]);
  const csv = await fixture('sample.csv');
  const fakeFetch = async (url) => (url.includes('broken') ? new Response('nope', { status: 500 }) : new Response(csv));
  const results = await runConfiguredFeeds(query, feeds, fakeFetch);
  assert.match(results['Broken Agency'].error, /HTTP 500/);
  assert.strictEqual(results['Example Lettings'].updated, 2);
});
