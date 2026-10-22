# Amesi Agora — Cyprus classifieds

A classifieds marketplace for Cyprus. You can browse by category, search and filter ads across Nicosia, Limassol, Larnaca, Paphos and Famagusta, and post ads with photos.
The name, design and demo content are all original.

## Features

- **Categories**: 10 top-level categories (Property, Motors, Electronics, Jobs, …), each with subcategories and live ad counts
- **Search and filters**: keyword, category, city, price range; sort by recommended, newest, price or most viewed; pagination
- **Ad pages**: photo gallery, details, view counter, seller card with a "show phone number" button, links to the seller's other ads
- **Accounts**: register and log in (scrypt-hashed passwords, httpOnly session cookie)
- **Posting**: create ads with up to 8 photos; edit them, mark them sold, reactivate or delete them under *My ads*
- **Favourites**: save ads with ♡
- **Messages**: message a seller from an ad and reply from your inbox
- Responsive layout for desktop and mobile

## Running it locally

Requires Node.js 22 or later.

```bash
npm install
npm start          # http://localhost:3000  (set PORT to change)
npm test           # API tests
```

Locally the app uses an embedded Postgres (PGlite) stored in `data/`, created and seeded on first start.
The demo ads belong to a "Demo Seller" account (`demo@example.com`) whose password is not published.

## Deploying (Netlify)

- `public/` is served as static files; `public/_redirects` sends client-side routes to `index.html`.
- `netlify/functions/api.mjs` serves `/api/*` and `/uploads/*`.
- Data lives in **Netlify Database** (Postgres). The schema and seed data are in
  `netlify/database/migrations/`, and Netlify applies them on each deploy. Never edit a migration that has
  already been applied; add a new one instead.
- Photos are stored in **Netlify Blobs** (store `ad-photos`). The browser resizes them before upload to stay under
  the Functions request-size limit.

## Partner listing feeds

Agencies that have **agreed** to share their listings can be imported automatically. Only add a feed with
the partner's written permission. Each imported ad credits the partner and links back to the original listing,
and buyers are sent to the partner to enquire.

**Turning it on (Netlify → Project configuration → Environment variables, scope: Functions):**

- `FEEDS`: a JSON list of feeds, for example
  `[{"name":"Example Realty","url":"https://partner.example/feed.xml","format":"kyero"}]`
  (`format` is `kyero` or `csv`; leave it out to detect it automatically)
- `IMPORT_SECRET`: any long random string (it protects the import function)

Feeds are imported every day at 03:17 UTC. To run one straight away, open Netlify → Logs → Functions →
`import-feeds` and choose **Run now**.

**How it syncs:**
- Ads are matched by the partner's own listing ID, so each run updates prices and details in place.
- Listings that disappear from the feed are taken down.
- A feed that comes back empty or broken is treated as an error and leaves existing ads untouched.
- Listings outside the five cities, or of an unrecognised property type, are skipped and counted.

**Formats:**
- **Kyero XML (v3)**: a common property-feed standard; ask the partner for their "Kyero feed".
- **CSV** with a header row: `id, title, description, price, listing (sale/rent), type, town, bedrooms,
  bathrooms, area_m2, url, images` (several image URLs separated by `|`). See `test/fixtures/sample.csv`.

**Uploading a file instead of a feed URL** (for partners who send a CSV or XML file):

```bash
curl -X POST -H "x-import-secret: $IMPORT_SECRET" --data-binary @listings.csv \
  "https://amesi-agora.netlify.app/api/admin/import/Partner%20Name"
```

It follows the same rules as the daily import, and replies with how many listings were imported, updated, taken
down and skipped (with reasons). Uploading a newer file refreshes that partner's listings. The endpoint is
disabled unless `IMPORT_SECRET` is set. Files must be under about 6 MB (Netlify's request limit).

**Trying a file locally:** `npm run import-feed -- --name "Example Realty" --file test/fixtures/sample-kyero.xml`,
then `npm start`.

## Structure

```
lib/api.mjs                     REST API (web Request -> Response), shared by Netlify and local dev
lib/auth.mjs                    password hashing and cookie helpers
lib/feeds.mjs                   partner feed importer (Kyero XML / CSV)
netlify/functions/api.mjs       Netlify Function wiring: Netlify Database + Blobs
netlify/functions/import-feeds*  daily feed import (scheduled trigger + background worker)
scripts/import-feed.mjs         import a feed file into the local database
netlify/database/migrations/    Postgres schema, categories and demo data
server/dev.mjs                  local dev server (embedded Postgres, photos on disk)
public/                         single-page frontend (vanilla JS, history routing)
test/                           node:test API tests
```
