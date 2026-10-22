const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('./auth');

const CITIES = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta'];

const CATEGORIES = [
  { slug: 'property', name: 'Property', icon: '🏠', subs: ['Apartments for sale', 'Apartments for rent', 'Houses for sale', 'Houses for rent', 'Land & plots', 'Commercial property'] },
  { slug: 'motors', name: 'Motors', icon: '🚗', subs: ['Cars', 'Motorcycles', 'Vans & trucks', 'Boats', 'Car parts & accessories'] },
  { slug: 'electronics', name: 'Electronics', icon: '📱', subs: ['Mobile phones', 'Computers & laptops', 'TV & audio', 'Cameras', 'Video games & consoles'] },
  { slug: 'home-garden', name: 'Home & Garden', icon: '🛋️', subs: ['Furniture', 'Appliances', 'Garden', 'Home decor', 'Tools & DIY'] },
  { slug: 'fashion', name: 'Fashion & Beauty', icon: '👗', subs: ['Women clothing', 'Men clothing', 'Shoes', 'Watches & jewellery', 'Beauty & health'] },
  { slug: 'jobs', name: 'Jobs', icon: '💼', subs: ['Hospitality', 'IT & telecoms', 'Sales & retail', 'Construction', 'Office & admin'] },
  { slug: 'services', name: 'Services', icon: '🛠️', subs: ['Repairs', 'Cleaning', 'Lessons & tutoring', 'Moving & transport', 'Beauty services'] },
  { slug: 'kids', name: 'Kids & Baby', icon: '🧸', subs: ['Toys', 'Strollers & car seats', 'Kids clothing', 'Baby furniture'] },
  { slug: 'hobbies', name: 'Sports & Hobbies', icon: '⚽', subs: ['Bicycles', 'Fitness equipment', 'Musical instruments', 'Books', 'Camping & outdoor'] },
  { slug: 'animals', name: 'Animals', icon: '🐾', subs: ['Dogs', 'Cats', 'Birds', 'Pet accessories'] },
];

function slugify(s) {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES categories(id),
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT
    );
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL,
      city TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      views INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ads_category ON ads(category_id);
    CREATE INDEX IF NOT EXISTS ads_created ON ads(created_at);
    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, ad_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  seedCategories(db);
  return db;
}

function seedCategories(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO categories (parent_id, slug, name, icon) VALUES (?, ?, ?, ?)');
  for (const c of CATEGORIES) {
    const { lastInsertRowid } = insert.run(null, c.slug, c.name, c.icon);
    for (const sub of c.subs) insert.run(lastInsertRowid, `${c.slug}--${slugify(sub)}`, sub, null);
  }
}

// Demo content so the site isn't empty on first run.
const DEMO_ADS = [
  ['property--apartments-for-rent', '2-bedroom apartment near the seafront', 'Bright, fully furnished 2-bedroom apartment, 5 minutes walk from the beach. Covered parking, storage room, A/C in all rooms. Available from next month.', 1150, 'Limassol', 1],
  ['property--houses-for-sale', '3-bedroom detached house with garden', 'Detached family house on a 600 m² plot. Open-plan kitchen, fireplace, solar water heater, private garden with fruit trees.', 345000, 'Paphos', 1],
  ['property--land-and-plots', 'Residential plot with mountain views', 'Residential plot of 820 m² in a quiet village area, building density 60%. Title deeds available.', 89000, 'Larnaca', 0],
  ['property--apartments-for-sale', 'Modern studio in city centre', 'Newly renovated studio, ideal for investment. Close to university and public transport.', 98000, 'Nicosia', 0],
  ['motors--cars', 'Toyota Yaris Hybrid 2019, low mileage', 'One owner, full service history, 48,000 km. Automatic, reversing camera, very economical.', 14500, 'Nicosia', 1],
  ['motors--cars', 'Mazda CX-5 2017 diesel', 'Well maintained SUV, leather seats, navigation, new tyres. MOT valid until next year.', 16900, 'Limassol', 0],
  ['motors--motorcycles', 'Honda PCX 125 scooter', 'Perfect city scooter, 2021, 9,000 km, top box included.', 2800, 'Larnaca', 0],
  ['motors--boats', 'Fishing boat 5.2 m with outboard', '40 HP outboard engine, trailer included, licensed and insured.', 7200, 'Famagusta', 0],
  ['electronics--mobile-phones', 'iPhone 14 128GB, like new', 'Battery health 94%, always used with case and screen protector. Comes with original box.', 520, 'Nicosia', 0],
  ['electronics--computers-and-laptops', 'Gaming laptop RTX 3060, 16GB RAM', '15.6" 144Hz screen, 1TB SSD. Works perfectly, selling because I upgraded.', 780, 'Limassol', 1],
  ['electronics--tv-and-audio', '55" 4K Smart TV', 'Smart TV with HDR, wall mount included. Remote and original stand.', 330, 'Paphos', 0],
  ['electronics--video-games-and-consoles', 'PlayStation 5 with two controllers', 'Disc edition, includes 3 games. Very good condition.', 420, 'Larnaca', 0],
  ['home-garden--furniture', 'Corner sofa, grey fabric', 'Comfortable L-shaped sofa, 2.8 m × 1.9 m. Pet and smoke free home. Must collect.', 350, 'Nicosia', 0],
  ['home-garden--appliances', 'Washing machine 8kg, A+++', '3 years old, works great. Can help with transport within the city.', 180, 'Limassol', 0],
  ['home-garden--garden', 'Outdoor dining set, 6 chairs', 'Aluminium table with 6 stackable chairs, ideal for verandas.', 260, 'Paphos', 0],
  ['fashion--watches-and-jewellery', 'Automatic diver watch, stainless steel', 'Worn a handful of times, box and papers included.', 240, 'Larnaca', 0],
  ['fashion--shoes', 'Running shoes size 43, new', 'Brand new in box, wrong size purchase.', 70, 'Nicosia', 0],
  ['jobs--hospitality', 'Waiter / waitress wanted for summer season', 'Beachfront restaurant seeks experienced staff. English required, Greek is a plus. Full time, good tips.', null, 'Famagusta', 0],
  ['jobs--it-and-telecoms', 'Junior web developer', 'Growing agency looking for a junior developer with JavaScript experience. Hybrid work possible.', null, 'Limassol', 1],
  ['services--lessons-and-tutoring', 'Maths & physics private lessons', 'Experienced tutor for GCSE / A-level / Pancyprian exams. Online or in person.', 25, 'Nicosia', 0],
  ['services--moving-and-transport', 'House moves island-wide', 'Professional team, packing materials, insured. Free quotation.', null, 'Larnaca', 0],
  ['kids--strollers-and-car-seats', 'Travel system stroller + car seat', 'Excellent condition, folds compactly. Rain cover included.', 150, 'Limassol', 0],
  ['hobbies--bicycles', 'Mountain bike 29", hydraulic brakes', 'Aluminium frame size L, recently serviced.', 390, 'Paphos', 0],
  ['hobbies--musical-instruments', 'Acoustic guitar with case', 'Solid spruce top, great sound. Ideal for beginners and intermediates.', 120, 'Nicosia', 0],
  ['animals--pet-accessories', 'Large dog crate', 'Foldable metal crate, 106 cm, with plastic tray.', 45, 'Larnaca', 0],
];

function seedDemo(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM ads').get().n;
  if (n > 0) return;
  let user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com');
  if (!user) {
    const r = db.prepare('INSERT INTO users (email, name, phone, password_hash) VALUES (?, ?, ?, ?)')
      .run('demo@example.com', 'Demo Seller', '+357 99 000000', hashPassword('demo1234'));
    user = { id: r.lastInsertRowid };
  }
  const catId = db.prepare('SELECT id FROM categories WHERE slug = ?');
  const insert = db.prepare(`INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`);
  DEMO_ADS.forEach(([slug, title, desc, price, city, featured], i) => {
    insert.run(user.id, catId.get(slug).id, title, desc, price, city, featured, `-${i * 7} hours`);
  });
}

module.exports = { openDb, seedDemo, CITIES };
