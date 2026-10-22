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

## Running it

Requires Node.js 22.13 or later (it uses the built-in `node:sqlite`).

```bash
npm install
npm start          # http://localhost:3000  (set PORT to change)
npm test           # API tests
```

On first start the app creates `data/app.db` and seeds demo ads.
Demo login: `demo@example.com` / `demo1234`. Uploaded photos are stored in `uploads/`.

## Structure

```
src/server.js   Express app and REST API (/api/...)
src/db.js       SQLite schema, categories, cities, demo seed data
src/auth.js     password hashing and session helpers
public/         single-page frontend (vanilla JS, history routing)
test/           node:test API tests
```
