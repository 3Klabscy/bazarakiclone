// Imports listings from partner feeds (agencies that have agreed to share their
// listings). Supports Kyero XML (a common property-feed standard) and a simple CSV.
// Each ad is matched by (feed name, the partner's own listing ID), so re-running
// an import updates ads in place, and listings that leave the feed are taken down.
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { hashPassword } from './auth.mjs';

// Towns and districts mapped to the five cities the site uses.
const CITY_ALIASES = {
  Nicosia: ['nicosia', 'lefkosia', 'strovolos', 'lakatamia', 'latsia', 'aglantzia', 'engomi', 'egkomi', 'dali', 'geri', 'tseri', 'kokkinotrimithia'],
  Limassol: ['limassol', 'lemesos', 'germasogeia', 'mesa geitonia', 'agios athanasios', 'ypsonas', 'kolossi', 'erimi', 'parekklisia', 'pyrgos', 'moni'],
  Larnaca: ['larnaca', 'larnaka', 'aradippou', 'livadia', 'oroklini', 'dromolaxia', 'kiti', 'pervolia', 'mazotos', 'xylofagou', 'pyla', 'meneou'],
  Paphos: ['paphos', 'pafos', 'kato paphos', 'chloraka', 'geroskipou', 'peyia', 'pegeia', 'tala', 'kissonerga', 'emba', 'polis', 'mesogi', 'konia', 'tremithousa'],
  Famagusta: ['famagusta', 'ammochostos', 'ayia napa', 'agia napa', 'protaras', 'paralimni', 'deryneia', 'sotira', 'frenaros', 'liopetri', 'avgorou', 'kapparis'],
};

// Property type words mapped to our subcategories. `null` = depends on sale/rent.
const TYPE_RULES = [
  [/land|plot|field/, 'property--land-and-plots'],
  [/commercial|office|shop|retail|warehouse|industrial|hotel|building|restaurant/, 'property--commercial-property'],
  [/apartment|flat|studio|penthouse|maisonette|duplex/, 'apartments'],
  [/house|villa|bungalow|townhouse|detached|semi|cottage|residence/, 'houses'],
];

export function mapCity(...names) {
  for (const raw of names) {
    const n = String(raw ?? '').toLowerCase().trim();
    if (!n) continue;
    for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
      if (aliases.some((a) => n === a || n.includes(a))) return city;
    }
  }
  return null;
}

export function mapCategory(type, forRent) {
  const t = String(type ?? '').toLowerCase();
  for (const [re, target] of TYPE_RULES) {
    if (!re.test(t)) continue;
    if (target.startsWith('property--')) return target;
    return `property--${target}-for-${forRent ? 'rent' : 'sale'}`;
  }
  return null;
}

const text = (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return text(v.en ?? v['#text'] ?? Object.values(v)[0]);
  return String(v).trim();
};
const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function titleFor({ beds, type, town }) {
  const kind = String(type || 'property').toLowerCase();
  return `${beds ? `${beds}-bedroom ` : ''}${kind} in ${town}`.replace(/^./, (c) => c.toUpperCase());
}

// ---------- Parsers: both return normalised listings ----------

export function parseKyero(xml) {
  const doc = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true }).parse(xml);
  const root = doc.root ?? doc;
  return asArray(root.property).map((p) => {
    const freq = text(p.price_freq).toLowerCase();
    const town = text(p.town);
    return {
      externalId: text(p.id) || text(p.ref),
      title: text(p.title) || titleFor({ beds: num(p.beds), type: text(p.type), town: town || text(p.province) }),
      description: text(p.desc),
      price: num(p.price),
      forRent: freq === 'month' || freq === 'week' || freq === 'rent',
      type: text(p.type),
      town,
      province: text(p.province),
      url: text(p.url),
      images: asArray(p.images?.image).map((i) => text(i.url ?? i)).filter(Boolean),
      attributes: {
        ...(num(p.beds) && { bedrooms: num(p.beds) }),
        ...(num(p.baths) && { bathrooms: num(p.baths) }),
        ...(num(p.surface_area?.built) && { area_m2: num(p.surface_area.built) }),
        ...(num(p.surface_area?.plot) && { plot_m2: num(p.surface_area.plot) }),
        ...(text(p.ref) && { reference: text(p.ref) }),
        ...(freq === 'week' && { price_period: 'week' }),
        ...(freq === 'month' && { price_period: 'month' }),
      },
    };
  });
}

// RFC 4180-style CSV (quoted fields, doubled quotes, newlines inside quotes).
export function parseCsvRows(csv) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// Columns: id, title, description, price, listing (sale|rent), type, town,
// bedrooms, bathrooms, area_m2, url, images (several URLs separated by |)
export function parseCsv(csv) {
  const [header, ...rows] = parseCsvRows(csv.replace(/^﻿/, ''));
  const cols = header.map((h) => h.trim().toLowerCase());
  return rows.map((r) => {
    const get = (k) => (r[cols.indexOf(k)] ?? '').trim();
    const town = get('town') || get('city');
    return {
      externalId: get('id'),
      title: get('title') || titleFor({ beds: num(get('bedrooms')), type: get('type'), town }),
      description: get('description'),
      price: num(get('price')),
      forRent: /rent|let/i.test(get('listing')),
      type: get('type'),
      town,
      province: get('district'),
      url: get('url'),
      images: get('images').split('|').map((s) => s.trim()).filter(Boolean),
      attributes: {
        ...(num(get('bedrooms')) && { bedrooms: num(get('bedrooms')) }),
        ...(num(get('bathrooms')) && { bathrooms: num(get('bathrooms')) }),
        ...(num(get('area_m2')) && { area_m2: num(get('area_m2')) }),
        ...(/rent|let/i.test(get('listing')) && { price_period: 'month' }),
      },
    };
  });
}

export function parseFeed(body, format) {
  const f = format ?? (body.trimStart().startsWith('<') ? 'kyero' : 'csv');
  if (f === 'kyero' || f === 'xml') return parseKyero(body);
  if (f === 'csv') return parseCsv(body);
  throw new Error(`Unknown feed format "${format}"`);
}

const isHttpUrl = (u) => /^https?:\/\//i.test(u);

// ---------- Import ----------

/**
 * @param {(text: string, params?: any[]) => Promise<any[]>} query
 * @param {{ name: string, body: string, format?: string }} feed
 */
export async function importFeed(query, { name, body, format }) {
  const one = async (t, p) => (await query(t, p))[0];
  const stats = { imported: 0, updated: 0, removed: 0, skipped: 0, reasons: {} };
  const skip = (reason) => { stats.skipped++; stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1; };

  // Each partner gets a seller account; its password is random and never used.
  let feedRow = await one('SELECT * FROM feeds WHERE name = $1', [name]);
  if (!feedRow) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const user = (await one('SELECT id FROM users WHERE email = $1', [`feed+${slug}@feeds.invalid`]))
      ?? (await one(`INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [`feed+${slug}@feeds.invalid`, name, hashPassword(crypto.randomBytes(24).toString('hex'))]));
    feedRow = await one('INSERT INTO feeds (name, seller_id) VALUES ($1, $2) RETURNING *', [name, user.id]);
  }

  const categories = new Map((await query('SELECT id, slug FROM categories')).map((c) => [c.slug, c.id]));
  const seen = [];
  for (const item of parseFeed(body, format)) {
    if (!item.externalId) { skip('missing id'); continue; }
    const city = mapCity(item.town, item.province);
    if (!city) { skip('unknown location'); continue; }
    const categoryId = categories.get(mapCategory(item.type, item.forRent));
    if (!categoryId) { skip('unknown property type'); continue; }
    if (!item.title || item.title.length < 3) { skip('missing title'); continue; }
    const description = item.description.length >= 10 ? item.description : `${item.title}. Listed by ${name}.`;
    const images = item.images.filter(isHttpUrl).slice(0, 8);
    const url = isHttpUrl(item.url) ? item.url : null;

    const existing = await one('SELECT id FROM ads WHERE source_feed = $1 AND external_id = $2', [name, item.externalId]);
    if (existing) {
      await query(`UPDATE ads SET category_id = $1, title = $2, description = $3, price = $4, city = $5, images = $6,
          attributes = $7, external_url = $8, status = 'active' WHERE id = $9`,
        [categoryId, item.title.slice(0, 150), description, item.price, city, JSON.stringify(images),
          JSON.stringify(item.attributes), url, existing.id]);
      stats.updated++;
    } else {
      await query(`INSERT INTO ads (user_id, category_id, title, description, price, city, images, attributes,
          source_feed, external_id, external_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [feedRow.seller_id, categoryId, item.title.slice(0, 150), description, item.price, city, JSON.stringify(images),
          JSON.stringify(item.attributes), name, item.externalId, url]);
      stats.imported++;
    }
    seen.push(item.externalId);
  }

  // A feed with nothing usable is almost certainly broken (wrong format, error page),
  // not a partner who sold everything overnight: keep their ads up and report it.
  if (!seen.length) {
    await query('UPDATE feeds SET last_run_at = now(), last_status = $2, last_stats = $3 WHERE name = $1',
      [name, 'error: no usable listings in feed', JSON.stringify(stats)]);
    throw new Error('No usable listings in feed; existing ads were left unchanged');
  }

  // Listings no longer in the feed have been sold or withdrawn: take them down.
  const removed = await query(`UPDATE ads SET status = 'inactive'
    WHERE source_feed = $1 AND status = 'active' AND NOT (external_id = ANY($2::text[])) RETURNING id`, [name, seen]);
  stats.removed = removed.length;

  await query('UPDATE feeds SET last_run_at = now(), last_status = $2, last_stats = $3 WHERE name = $1',
    [name, 'ok', JSON.stringify(stats)]);
  return stats;
}

/** Fetches every feed configured in the FEEDS setting and imports it. */
export async function runConfiguredFeeds(query, feedsJson, fetchImpl = fetch) {
  let feeds;
  try {
    feeds = JSON.parse(feedsJson || '[]');
  } catch {
    throw new Error('FEEDS must be a JSON list like [{"name":"…","url":"https://…","format":"kyero"}]');
  }
  const results = {};
  for (const feed of feeds) {
    try {
      const res = await fetchImpl(feed.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching feed`);
      results[feed.name] = await importFeed(query, { name: feed.name, body: await res.text(), format: feed.format });
    } catch (err) {
      results[feed.name] = { error: err.message };
      await query('UPDATE feeds SET last_run_at = now(), last_status = $2 WHERE name = $1', [feed.name, `error: ${err.message}`]);
    }
  }
  return results;
}

