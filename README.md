# Agora — Cyprus classifieds

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
Demo login: `demo@example.com` / `demo1234`.

## Deploying (Netlify)

- `public/` is served as static files; `public/_redirects` sends client-side routes to `index.html`.
- `netlify/functions/api.mjs` serves `/api/*` and `/uploads/*`.
- Data lives in **Netlify Database** (Postgres). The schema and seed data are in
  `netlify/database/migrations/`, and Netlify applies them on each deploy. Never edit a migration that has
  already been applied; add a new one instead.
- Photos are stored in **Netlify Blobs** (store `ad-photos`). The browser resizes them before upload to stay under
  the Functions request-size limit.

## Structure

```
lib/api.mjs                     REST API (web Request -> Response), shared by Netlify and local dev
lib/auth.mjs                    password hashing and cookie helpers
netlify/functions/api.mjs       Netlify Function wiring: Netlify Database + Blobs
netlify/database/migrations/    Postgres schema, categories and demo data
server/dev.mjs                  local dev server (embedded Postgres, photos on disk)
public/                         single-page frontend (vanilla JS, history routing)
test/                           node:test API tests
```
