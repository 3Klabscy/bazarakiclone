import test from 'node:test';
import assert from 'node:assert';
import { startServer } from '../server/dev.mjs';

let app, base;

test.before(async () => {
  app = await startServer({ port: 0, dataDir: null });
  base = app.url;
});
test.after(() => app.close());

// Minimal cookie-keeping client.
function client() {
  let cookie = '';
  return async (url, { method = 'GET', body, form } = {}) => {
    const headers = cookie ? { cookie } : {};
    let payload;
    if (form) payload = form;
    else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

test('categories and demo ads are seeded', async () => {
  const req = client();
  const cats = (await req('/api/categories')).data;
  assert.strictEqual(cats.length, 10);
  assert.ok(cats.find((c) => c.slug === 'property').children.length > 0);
  const ads = (await req('/api/ads')).data;
  assert.ok(ads.total >= 20);
});

test('search and filters', async () => {
  const req = client();
  const byCat = (await req('/api/ads?category=motors')).data;
  assert.ok(byCat.ads.length > 0);
  assert.ok(byCat.ads.every((a) => a.parent_slug === 'motors'));
  const byCity = (await req('/api/ads?city=Paphos')).data;
  assert.ok(byCity.ads.every((a) => a.city === 'Paphos'));
  const byPrice = (await req('/api/ads?min=100&max=500&sort=price_asc')).data;
  const prices = byPrice.ads.map((a) => a.price);
  assert.ok(prices.every((p) => p >= 100 && p <= 500));
  assert.deepStrictEqual(prices, [...prices].sort((a, b) => a - b));
  const byQ = (await req('/api/ads?q=iphone')).data;
  assert.strictEqual(byQ.ads.length, 1);
});

test('register, post, edit, favourite, message and delete an ad', async () => {
  const seller = client();
  let r = await seller('/api/register', { method: 'POST', body: { name: 'Maria', email: 'maria@example.com', password: 'secret1', phone: '+357 99 111111' } });
  assert.strictEqual(r.status, 201);

  r = await seller('/api/ads', { method: 'POST', form: (() => {
    const f = new FormData();
    f.set('title', 'Vintage desk lamp');
    f.set('description', 'Brass lamp in great working order.');
    f.set('price', '35');
    f.set('city', 'Limassol');
    f.set('category', 'home-garden--home-decor');
    f.append('images', new Blob([Buffer.from('fakepng')], { type: 'image/png' }), 'lamp.png');
    return f;
  })() });
  assert.strictEqual(r.status, 201);
  const id = r.data.id;

  r = await seller(`/api/ads/${id}`);
  assert.strictEqual(r.data.title, 'Vintage desk lamp');
  assert.strictEqual(r.data.images.length, 1);
  const photo = await fetch(base + r.data.images[0]);
  assert.strictEqual(photo.headers.get('content-type'), 'image/png');
  assert.strictEqual(await photo.text(), 'fakepng');
  assert.strictEqual(r.data.seller.phone, '+357 99 111111');

  r = await seller(`/api/ads/${id}`, { method: 'PATCH', body: { price: '30' } });
  assert.strictEqual(r.status, 200);

  const buyer = client();
  assert.strictEqual((await buyer(`/api/favorites/${id}`, { method: 'POST' })).status, 401);
  await buyer('/api/register', { method: 'POST', body: { name: 'Nikos', email: 'nikos@example.com', password: 'secret2' } });
  assert.strictEqual((await buyer(`/api/ads/${id}`, { method: 'PATCH', body: { price: 1 } })).status, 403);
  await buyer(`/api/favorites/${id}`, { method: 'POST' });
  const favs = (await buyer('/api/favorites')).data;
  assert.deepStrictEqual(favs.map((a) => a.id), [id]);
  assert.strictEqual(favs[0].price, 30);

  r = await buyer(`/api/ads/${id}/messages`, { method: 'POST', body: { body: 'Is it available?' } });
  assert.strictEqual(r.status, 201);
  const inbox = (await seller('/api/messages')).data;
  assert.strictEqual(inbox[0].body, 'Is it available?');
  r = await seller(`/api/ads/${id}/messages`, { method: 'POST', body: { body: 'Yes!', to: inbox[0].from_user_id } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await buyer('/api/messages')).data[0].body, 'Yes!');

  r = await seller(`/api/ads/${id}`, { method: 'PATCH', body: { status: 'sold' } });
  assert.ok(!(await buyer('/api/ads?q=desk lamp')).data.ads.length);

  assert.strictEqual((await seller(`/api/ads/${id}`, { method: 'DELETE' })).status, 200);
  assert.strictEqual((await buyer(`/api/ads/${id}`)).status, 404);
});

test('validation and login errors', async () => {
  const req = client();
  assert.strictEqual((await req('/api/login', { method: 'POST', body: { email: 'demo@example.com', password: 'wrong' } })).status, 401);
  // The original demo password was published, so a migration replaces it.
  assert.strictEqual((await req('/api/login', { method: 'POST', body: { email: 'demo@example.com', password: 'demo1234' } })).status, 401);
  await req('/api/register', { method: 'POST', body: { name: 'Eleni', email: 'eleni@example.com', password: 'secret3' } });
  await req('/api/logout', { method: 'POST' });
  assert.strictEqual((await req('/api/login', { method: 'POST', body: { email: 'eleni@example.com', password: 'secret3' } })).status, 200);
  const f = new FormData();
  f.set('title', 'x');
  const r = await req('/api/ads', { method: 'POST', form: f });
  assert.strictEqual(r.status, 400);
});

test('frontend routes fall back to index.html', async () => {
  const res = await fetch(base + '/c/motors');
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /<main/);
});
