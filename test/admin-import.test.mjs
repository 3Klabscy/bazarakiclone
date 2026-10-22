import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/dev.mjs';

const SECRET = 'test-secret-123';
const dir = path.dirname(fileURLToPath(import.meta.url));
let app;

test.before(async () => {
  app = await startServer({ port: 0, dataDir: null, importSecret: SECRET });
});
test.after(() => app.close());

const upload = (name, body, secret = SECRET, qs = '') => fetch(`${app.url}/api/admin/import/${encodeURIComponent(name)}${qs}`, {
  method: 'POST', headers: secret ? { 'x-import-secret': secret } : {}, body,
});

test('rejects uploads without the right secret', async () => {
  const csv = await fs.readFile(path.join(dir, 'fixtures', 'sample.csv'), 'utf8');
  assert.strictEqual((await upload('Example Lettings', csv, null)).status, 403);
  assert.strictEqual((await upload('Example Lettings', csv, 'wrong')).status, 403);
});

test('imports an uploaded CSV, then syncs on re-upload', async () => {
  const csv = await fs.readFile(path.join(dir, 'fixtures', 'sample.csv'), 'utf8');
  let res = await upload('Example Lettings', csv);
  assert.strictEqual(res.status, 200);
  let stats = await res.json();
  assert.deepStrictEqual([stats.partner, stats.imported, stats.skipped], ['Example Lettings', 2, 0]);

  const ads = (await (await fetch(`${app.url}/api/ads?q=family house with garden`)).json()).ads;
  assert.strictEqual(ads.length, 1);
  assert.strictEqual(ads[0].source_feed, 'Example Lettings');

  // Re-upload without the shop: it is taken down, the house is updated.
  const withoutShop = csv.split('\n').filter((l) => !l.startsWith('C-1')).join('\n');
  stats = await (await upload('Example Lettings', withoutShop)).json();
  assert.deepStrictEqual([stats.imported, stats.updated, stats.removed], [0, 1, 1]);
});

test('imports Kyero XML and reports bad uploads clearly', async () => {
  const xml = await fs.readFile(path.join(dir, 'fixtures', 'sample-kyero.xml'), 'utf8');
  const stats = await (await upload('Example Realty', xml)).json();
  assert.strictEqual(stats.imported, 3);
  let res = await upload('Example Realty', '');
  assert.strictEqual(res.status, 400);
  res = await upload('Example Realty', 'id,title\n,,\n');
  assert.strictEqual(res.status, 422);
  assert.match((await res.json()).error, /No usable listings/);
});

test('is disabled when no secret is configured', async () => {
  const other = await startServer({ port: 0, dataDir: null, importSecret: '' });
  const res = await fetch(`${other.url}/api/admin/import/Anyone`, { method: 'POST', headers: { 'x-import-secret': '' }, body: 'x' });
  assert.strictEqual(res.status, 403);
  await other.close();
});
