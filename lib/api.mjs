// Platform-neutral API: takes a web Request, returns a web Response.
// Used by the Netlify Function in production and by src/server.mjs locally.
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, newToken, parseCookies } from './auth.mjs';

export const CITIES = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta'];
const PAGE_SIZE = 20;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });

const AD_SELECT = `SELECT a.*, c.name AS category_name, c.slug AS category_slug,
    p.name AS parent_name, p.slug AS parent_slug
  FROM ads a JOIN categories c ON c.id = a.category_id LEFT JOIN categories p ON p.id = c.parent_id`;

/**
 * @param {object} deps
 * @param {(text: string, params?: any[]) => Promise<any[]>} deps.query  Postgres query returning rows
 * @param {{ set: Function, getWithMetadata: Function, delete: Function }} deps.photos  Netlify Blobs-compatible store
 */
export function createApi({ query, photos }) {
  const one = async (text, params) => (await query(text, params))[0];

  function sessionCookie(req, token, maxAge) {
    const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
    return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
  }

  async function startSession(req, userId) {
    const token = newToken();
    await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
    return { 'Set-Cookie': sessionCookie(req, token, 30 * 24 * 3600) };
  }

  async function currentUser(req) {
    const token = parseCookies(req.headers.get('cookie') ?? '').sid;
    if (!token) return undefined;
    return one(`SELECT u.id, u.email, u.name, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`, [token]);
  }

  function requireUser(ctx) {
    if (!ctx.user) throw new HttpError(401, 'Please log in first');
  }

  async function readJson(req) {
    try {
      return (await req.json()) ?? {};
    } catch {
      return {};
    }
  }

  async function withFavorites(rows, userId) {
    if (userId === undefined) return rows;
    const favs = new Set((await query('SELECT ad_id FROM favorites WHERE user_id = $1', [userId])).map((r) => r.ad_id));
    return rows.map((r) => ({ ...r, favorite: favs.has(r.id) }));
  }

  async function validateAd(body, { partial = false } = {}) {
    const { title, description, price, city, category } = body;
    if (!partial || title !== undefined) {
      if (!title || title.trim().length < 3) return 'Title must be at least 3 characters';
    }
    if (!partial || description !== undefined) {
      if (!description || description.trim().length < 10) return 'Description must be at least 10 characters';
    }
    if (!partial || city !== undefined) {
      if (!CITIES.includes(city)) return 'Please choose a city';
    }
    if (price !== undefined && price !== '' && price !== null && !(Number(price) >= 0)) return 'Price must be a positive number';
    if (!partial || category !== undefined) {
      const cat = await one('SELECT id, parent_id FROM categories WHERE slug = $1', [category ?? '']);
      if (!cat || !cat.parent_id) return 'Please choose a subcategory';
    }
    return null;
  }

  async function ownAd(ctx, id) {
    requireUser(ctx);
    const ad = await one('SELECT * FROM ads WHERE id = $1', [Number(id)]);
    if (!ad) throw new HttpError(404, 'Ad not found');
    if (ad.user_id !== ctx.user.id) throw new HttpError(403, 'You can only change your own ads');
    return ad;
  }

  const toPrice = (p) => (p === '' || p === null || p === undefined ? null : Number(p));

  // ---------- Routes ----------
  const routes = [
    ['POST', /^\/api\/register$/, async ({ req }) => {
      const { email, name, phone, password } = await readJson(req);
      if (!email || !name || !password) throw new HttpError(400, 'Name, email and password are required');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Invalid email address');
      if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
      const lower = email.toLowerCase();
      if (await one('SELECT 1 FROM users WHERE email = $1', [lower])) throw new HttpError(409, 'An account with this email already exists');
      const user = await one(`INSERT INTO users (email, name, phone, password_hash) VALUES ($1, $2, $3, $4)
        RETURNING id, email, name, phone`, [lower, name.trim(), phone?.trim() || null, hashPassword(password)]);
      return json(user, 201, await startSession(req, user.id));
    }],

    ['POST', /^\/api\/login$/, async ({ req }) => {
      const { email, password } = await readJson(req);
      const user = email && (await one('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]));
      if (!user || !password || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Wrong email or password');
      return json({ id: user.id, email: user.email, name: user.name, phone: user.phone }, 200, await startSession(req, user.id));
    }],

    ['POST', /^\/api\/logout$/, async ({ req }) => {
      const token = parseCookies(req.headers.get('cookie') ?? '').sid;
      if (token) await query('DELETE FROM sessions WHERE token = $1', [token]);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
    }],

    ['GET', /^\/api\/me$/, async ({ user }) => json(user ?? null)],

    ['GET', /^\/api\/categories$/, async () => {
      const rows = await query(`SELECT c.id, c.parent_id, c.slug, c.name, c.icon,
          (SELECT COUNT(*)::int FROM ads a JOIN categories s ON s.id = a.category_id
            WHERE a.status = 'active' AND (a.category_id = c.id OR s.parent_id = c.id)) AS ad_count
        FROM categories c ORDER BY c.position, c.id`);
      const top = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, children: [] }));
      for (const r of rows) if (r.parent_id) top.find((t) => t.id === r.parent_id).children.push(r);
      return json(top);
    }],

    ['GET', /^\/api\/cities$/, async () => json(CITIES)],

    ['GET', /^\/api\/ads$/, async ({ url, user }) => {
      const { q, category, city, min, max, sort, featured, user: owner } = Object.fromEntries(url.searchParams);
      const where = [`a.status = 'active'`];
      const params = [];
      const p = (v) => (params.push(v), `$${params.length}`);
      if (q) {
        const like = p(`%${q}%`);
        where.push(`(a.title ILIKE ${like} OR a.description ILIKE ${like})`);
      }
      if (category) {
        const c = p(category);
        where.push(`(c.slug = ${c} OR p.slug = ${c})`);
      }
      if (city) where.push(`a.city = ${p(city)}`);
      if (min) where.push(`a.price >= ${p(Number(min))}`);
      if (max) where.push(`a.price <= ${p(Number(max))}`);
      if (featured) where.push('a.featured');
      if (owner) where.push(`a.user_id = ${p(Number(owner))}`);
      const order = {
        price_asc: 'a.price ASC NULLS LAST',
        price_desc: 'a.price DESC NULLS LAST',
        popular: 'a.views DESC',
        newest: 'a.created_at DESC',
      }[sort] ?? 'a.featured DESC, a.created_at DESC';
      const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
      const whereSql = where.join(' AND ');
      const { n: total } = await one(`SELECT COUNT(*)::int AS n FROM ads a JOIN categories c ON c.id = a.category_id
        LEFT JOIN categories p ON p.id = c.parent_id WHERE ${whereSql}`, params);
      const rows = await query(`${AD_SELECT} WHERE ${whereSql} ORDER BY ${order}, a.id DESC
        LIMIT ${p(PAGE_SIZE)} OFFSET ${p((page - 1) * PAGE_SIZE)}`, params);
      return json({ total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), ads: await withFavorites(rows, user?.id) });
    }],

    ['GET', /^\/api\/ads\/(\d+)$/, async ({ user, params: [id] }) => {
      const row = await one(`${AD_SELECT} WHERE a.id = $1`, [Number(id)]);
      if (!row || (row.status !== 'active' && row.user_id !== user?.id)) throw new HttpError(404, 'Ad not found');
      await query('UPDATE ads SET views = views + 1 WHERE id = $1', [row.id]);
      const seller = await one(`SELECT id, name, phone, created_at,
          (SELECT COUNT(*)::int FROM ads WHERE user_id = users.id AND status = 'active') AS ad_count
        FROM users WHERE id = $1`, [row.user_id]);
      const [ad] = await withFavorites([{ ...row, views: row.views + 1 }], user?.id);
      return json({ ...ad, seller });
    }],

    ['POST', /^\/api\/ads$/, async ({ req, user }) => {
      requireUser({ user });
      let form;
      try {
        form = await req.formData();
      } catch {
        throw new HttpError(400, 'Invalid form data');
      }
      const body = Object.fromEntries([...form].filter(([, v]) => typeof v === 'string'));
      const err = await validateAd(body);
      if (err) throw new HttpError(400, err);
      const files = form.getAll('images').filter((f) => typeof f !== 'string' && f.size > 0);
      if (files.length > MAX_IMAGES) throw new HttpError(400, `At most ${MAX_IMAGES} photos per ad`);
      for (const f of files) {
        if (!IMAGE_TYPES[f.type]) throw new HttpError(400, 'Photos must be JPEG, PNG, WebP or GIF');
        if (f.size > MAX_IMAGE_BYTES) throw new HttpError(400, 'Each photo must be under 2 MB');
      }
      const images = [];
      for (const f of files) {
        const key = `${crypto.randomUUID()}.${IMAGE_TYPES[f.type]}`;
        await photos.set(key, await f.arrayBuffer(), { metadata: { contentType: f.type } });
        images.push(`/uploads/${key}`);
      }
      const { id: catId } = await one('SELECT id FROM categories WHERE slug = $1', [body.category]);
      const ad = await one(`INSERT INTO ads (user_id, category_id, title, description, price, city, images)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [user.id, catId, body.title.trim(), body.description.trim(), toPrice(body.price), body.city, JSON.stringify(images)]);
      return json({ id: ad.id }, 201);
    }],

    ['PATCH', /^\/api\/ads\/(\d+)$/, async ({ req, user, params: [id] }) => {
      const ad = await ownAd({ user }, id);
      const body = await readJson(req);
      const err = await validateAd(body, { partial: true });
      if (err) throw new HttpError(400, err);
      if (body.status !== undefined && !['active', 'sold', 'inactive'].includes(body.status)) throw new HttpError(400, 'Invalid status');
      const fields = {
        title: body.title?.trim(),
        description: body.description?.trim(),
        price: body.price === undefined ? undefined : toPrice(body.price),
        city: body.city,
        status: body.status,
        category_id: body.category ? (await one('SELECT id FROM categories WHERE slug = $1', [body.category])).id : undefined,
      };
      const sets = Object.entries(fields).filter(([, v]) => v !== undefined);
      if (sets.length) {
        await query(`UPDATE ads SET ${sets.map(([k], i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${sets.length + 1}`,
          [...sets.map(([, v]) => v), ad.id]);
      }
      return json({ ok: true });
    }],

    ['DELETE', /^\/api\/ads\/(\d+)$/, async ({ user, params: [id] }) => {
      const ad = await ownAd({ user }, id);
      for (const img of ad.images) await photos.delete(img.split('/').pop());
      await query('DELETE FROM ads WHERE id = $1', [ad.id]);
      return json({ ok: true });
    }],

    ['GET', /^\/api\/my\/ads$/, async ({ user }) => {
      requireUser({ user });
      return json(await query(`${AD_SELECT} WHERE a.user_id = $1 ORDER BY a.created_at DESC`, [user.id]));
    }],

    ['GET', /^\/api\/favorites$/, async ({ user }) => {
      requireUser({ user });
      const rows = await query(`${AD_SELECT} JOIN favorites f ON f.ad_id = a.id WHERE f.user_id = $1 ORDER BY a.created_at DESC`, [user.id]);
      return json(rows.map((r) => ({ ...r, favorite: true })));
    }],

    ['POST', /^\/api\/favorites\/(\d+)$/, async ({ user, params: [id] }) => {
      requireUser({ user });
      if (!(await one('SELECT 1 FROM ads WHERE id = $1', [Number(id)]))) throw new HttpError(404, 'Ad not found');
      await query('INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, Number(id)]);
      return json({ favorite: true });
    }],

    ['DELETE', /^\/api\/favorites\/(\d+)$/, async ({ user, params: [id] }) => {
      requireUser({ user });
      await query('DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2', [user.id, Number(id)]);
      return json({ favorite: false });
    }],

    ['POST', /^\/api\/ads\/(\d+)\/messages$/, async ({ req, user, params: [id] }) => {
      requireUser({ user });
      const ad = await one('SELECT id, user_id FROM ads WHERE id = $1', [Number(id)]);
      if (!ad) throw new HttpError(404, 'Ad not found');
      const data = await readJson(req);
      const body = String(data.body ?? '').trim();
      if (!body) throw new HttpError(400, 'Message cannot be empty');
      // A seller replying in their own ad's thread addresses the buyer given in `to`.
      const to = ad.user_id === user.id ? Number(data.to) : ad.user_id;
      if (!to || to === user.id) throw new HttpError(400, 'You cannot message yourself');
      await query('INSERT INTO messages (ad_id, from_user_id, to_user_id, body) VALUES ($1, $2, $3, $4)', [ad.id, user.id, to, body]);
      return json({ ok: true }, 201);
    }],

    ['GET', /^\/api\/messages$/, async ({ user }) => {
      requireUser({ user });
      return json(await query(`SELECT m.*, a.title AS ad_title, fu.name AS from_name, tu.name AS to_name
        FROM messages m JOIN ads a ON a.id = m.ad_id
        JOIN users fu ON fu.id = m.from_user_id JOIN users tu ON tu.id = m.to_user_id
        WHERE m.from_user_id = $1 OR m.to_user_id = $1 ORDER BY m.created_at DESC, m.id DESC`, [user.id]));
    }],

    ['GET', /^\/uploads\/([\w-]+\.(?:jpg|png|webp|gif))$/, async ({ params: [key] }) => {
      const entry = await photos.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!entry) return new Response('Not found', { status: 404 });
      return new Response(entry.data, {
        headers: { 'Content-Type': entry.metadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    }],
  ];

  return async function handle(req) {
    const url = new URL(req.url);
    try {
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          return await handler({ req, url, user: await currentUser(req), params: m.slice(1) });
        }
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong' }, 500);
    }
  };
}
