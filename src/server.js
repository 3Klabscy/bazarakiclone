const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { openDb, seedDemo, CITIES } = require('./db');
const { hashPassword, verifyPassword, newToken, parseCookies } = require('./auth');

const PAGE_SIZE = 20;
const MAX_IMAGES = 8;

function createApp({ dbFile, uploadDir, seed = true } = {}) {
  const db = openDb(dbFile ?? path.join(__dirname, '..', 'data', 'app.db'));
  if (seed) seedDemo(db);
  uploadDir ??= path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: MAX_IMAGES },
    fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
  });

  const app = express();
  app.use(express.json());

  // Resolve the logged-in user from the session cookie on every request.
  app.use((req, res, next) => {
    const token = parseCookies(req.headers.cookie).sid;
    req.user = token
      ? db.prepare(`SELECT u.id, u.email, u.name, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token)
      : undefined;
    next();
  });

  const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please log in first' }));

  function startSession(res, userId) {
    const token = newToken();
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  }

  function serializeAd(row, userId) {
    const ad = { ...row, images: JSON.parse(row.images) };
    if (userId !== undefined) {
      ad.favorite = !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND ad_id = ?').get(userId, row.id);
    }
    return ad;
  }

  const AD_SELECT = `SELECT a.*, c.name AS category_name, c.slug AS category_slug,
      p.name AS parent_name, p.slug AS parent_slug
    FROM ads a JOIN categories c ON c.id = a.category_id LEFT JOIN categories p ON p.id = c.parent_id`;

  // ---------- Auth ----------
  app.post('/api/register', (req, res) => {
    const { email, name, phone, password } = req.body ?? {};
    if (!email || !name || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase())) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const r = db.prepare('INSERT INTO users (email, name, phone, password_hash) VALUES (?, ?, ?, ?)')
      .run(email.toLowerCase(), name.trim(), phone?.trim() || null, hashPassword(password));
    startSession(res, r.lastInsertRowid);
    res.status(201).json({ id: r.lastInsertRowid, email: email.toLowerCase(), name: name.trim(), phone: phone?.trim() || null });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body ?? {};
    const user = email && db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (!user || !password || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    startSession(res, user.id);
    res.json({ id: user.id, email: user.email, name: user.name, phone: user.phone });
  });

  app.post('/api/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie).sid;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie('sid');
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => res.json(req.user ?? null));

  // ---------- Reference data ----------
  app.get('/api/categories', (req, res) => {
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM ads a LEFT JOIN categories s ON s.id = a.category_id
        WHERE a.status = 'active' AND (a.category_id = c.id OR s.parent_id = c.id)) AS ad_count
      FROM categories c ORDER BY c.id`).all();
    const top = rows.filter((r) => !r.parent_id).map((r) => ({ ...r, children: [] }));
    for (const r of rows) if (r.parent_id) top.find((t) => t.id === r.parent_id).children.push(r);
    res.json(top);
  });

  app.get('/api/cities', (req, res) => res.json(CITIES));

  // ---------- Ads ----------
  app.get('/api/ads', (req, res) => {
    const { q, category, city, min, max, sort, featured, user } = req.query;
    const where = [`a.status = 'active'`];
    const params = [];
    if (q) {
      where.push('(a.title LIKE ? OR a.description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      where.push('(c.slug = ? OR p.slug = ?)');
      params.push(category, category);
    }
    if (city) { where.push('a.city = ?'); params.push(city); }
    if (min) { where.push('a.price >= ?'); params.push(Number(min)); }
    if (max) { where.push('a.price <= ?'); params.push(Number(max)); }
    if (featured) where.push('a.featured = 1');
    if (user) { where.push('a.user_id = ?'); params.push(Number(user)); }
    const order = {
      price_asc: 'a.price IS NULL, a.price ASC',
      price_desc: 'a.price DESC',
      popular: 'a.views DESC',
      newest: 'a.created_at DESC',
    }[sort] ?? 'a.featured DESC, a.created_at DESC';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const whereSql = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ads a JOIN categories c ON c.id = a.category_id
      LEFT JOIN categories p ON p.id = c.parent_id WHERE ${whereSql}`).get(...params).n;
    const rows = db.prepare(`${AD_SELECT} WHERE ${whereSql} ORDER BY ${order}, a.id DESC LIMIT ? OFFSET ?`)
      .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.json({ total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), ads: rows.map((r) => serializeAd(r, req.user?.id)) });
  });

  app.get('/api/ads/:id', (req, res) => {
    const row = db.prepare(`${AD_SELECT} WHERE a.id = ?`).get(Number(req.params.id));
    if (!row || (row.status !== 'active' && row.user_id !== req.user?.id)) return res.status(404).json({ error: 'Ad not found' });
    db.prepare('UPDATE ads SET views = views + 1 WHERE id = ?').run(row.id);
    const seller = db.prepare('SELECT id, name, phone, created_at FROM users WHERE id = ?').get(row.user_id);
    const sellerAdCount = db.prepare(`SELECT COUNT(*) AS n FROM ads WHERE user_id = ? AND status = 'active'`).get(row.user_id).n;
    res.json({ ...serializeAd({ ...row, views: row.views + 1 }, req.user?.id), seller: { ...seller, ad_count: sellerAdCount } });
  });

  function validateAd(body, { partial = false } = {}) {
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
      const cat = db.prepare('SELECT id, parent_id FROM categories WHERE slug = ?').get(category ?? '');
      if (!cat || !cat.parent_id) return 'Please choose a subcategory';
    }
    return null;
  }

  app.post('/api/ads', requireUser, upload.array('images', MAX_IMAGES), (req, res) => {
    const err = validateAd(req.body);
    if (err) {
      for (const f of req.files ?? []) fs.unlink(f.path, () => {});
      return res.status(400).json({ error: err });
    }
    const { title, description, price, city, category } = req.body;
    const catId = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category).id;
    const images = (req.files ?? []).map((f) => `/uploads/${f.filename}`);
    const r = db.prepare(`INSERT INTO ads (user_id, category_id, title, description, price, city, images)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, catId, title.trim(), description.trim(),
      price === '' || price === undefined ? null : Number(price), city, JSON.stringify(images));
    res.status(201).json({ id: r.lastInsertRowid });
  });

  function ownAd(req, res) {
    const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(Number(req.params.id));
    if (!ad) { res.status(404).json({ error: 'Ad not found' }); return null; }
    if (ad.user_id !== req.user.id) { res.status(403).json({ error: 'You can only change your own ads' }); return null; }
    return ad;
  }

  app.patch('/api/ads/:id', requireUser, (req, res) => {
    const ad = ownAd(req, res);
    if (!ad) return;
    const body = req.body ?? {};
    const err = validateAd(body, { partial: true });
    if (err) return res.status(400).json({ error: err });
    if (body.status !== undefined && !['active', 'sold', 'inactive'].includes(body.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const fields = {
      title: body.title?.trim(),
      description: body.description?.trim(),
      price: body.price === undefined ? undefined : body.price === '' || body.price === null ? null : Number(body.price),
      city: body.city,
      status: body.status,
      category_id: body.category ? db.prepare('SELECT id FROM categories WHERE slug = ?').get(body.category).id : undefined,
    };
    const sets = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (sets.length) {
      db.prepare(`UPDATE ads SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...sets.map(([, v]) => v), ad.id);
    }
    res.json({ ok: true });
  });

  app.delete('/api/ads/:id', requireUser, (req, res) => {
    const ad = ownAd(req, res);
    if (!ad) return;
    for (const img of JSON.parse(ad.images)) fs.unlink(path.join(uploadDir, path.basename(img)), () => {});
    db.prepare('DELETE FROM ads WHERE id = ?').run(ad.id);
    res.json({ ok: true });
  });

  app.get('/api/my/ads', requireUser, (req, res) => {
    const rows = db.prepare(`${AD_SELECT} WHERE a.user_id = ? ORDER BY a.created_at DESC`).all(req.user.id);
    res.json(rows.map((r) => serializeAd(r)));
  });

  // ---------- Favourites ----------
  app.get('/api/favorites', requireUser, (req, res) => {
    const rows = db.prepare(`${AD_SELECT} JOIN favorites f ON f.ad_id = a.id WHERE f.user_id = ? ORDER BY a.created_at DESC`).all(req.user.id);
    res.json(rows.map((r) => serializeAd(r, req.user.id)));
  });

  app.post('/api/favorites/:id', requireUser, (req, res) => {
    if (!db.prepare('SELECT 1 FROM ads WHERE id = ?').get(Number(req.params.id))) return res.status(404).json({ error: 'Ad not found' });
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, ad_id) VALUES (?, ?)').run(req.user.id, Number(req.params.id));
    res.json({ favorite: true });
  });

  app.delete('/api/favorites/:id', requireUser, (req, res) => {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND ad_id = ?').run(req.user.id, Number(req.params.id));
    res.json({ favorite: false });
  });

  // ---------- Messages ----------
  app.post('/api/ads/:id/messages', requireUser, (req, res) => {
    const ad = db.prepare('SELECT id, user_id FROM ads WHERE id = ?').get(Number(req.params.id));
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    const body = String(req.body?.body ?? '').trim();
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    // A seller replying in their own ad's thread addresses the buyer given in `to`.
    const to = ad.user_id === req.user.id ? Number(req.body.to) : ad.user_id;
    if (!to || to === req.user.id) return res.status(400).json({ error: 'You cannot message yourself' });
    db.prepare('INSERT INTO messages (ad_id, from_user_id, to_user_id, body) VALUES (?, ?, ?, ?)').run(ad.id, req.user.id, to, body);
    res.status(201).json({ ok: true });
  });

  app.get('/api/messages', requireUser, (req, res) => {
    const rows = db.prepare(`SELECT m.*, a.title AS ad_title, fu.name AS from_name, tu.name AS to_name
      FROM messages m JOIN ads a ON a.id = m.ad_id
      JOIN users fu ON fu.id = m.from_user_id JOIN users tu ON tu.id = m.to_user_id
      WHERE m.from_user_id = ? OR m.to_user_id = ? ORDER BY m.created_at DESC, m.id DESC`).all(req.user.id, req.user.id);
    res.json(rows);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Multer errors (file too large, too many files) → 400 instead of 500.
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    next(err);
  });

  // ---------- Static frontend ----------
  app.use('/uploads', express.static(uploadDir));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Agora classifieds running at http://localhost:${port}`));
}

module.exports = { createApp };
