-- Schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DOUBLE PRECISION,
  city TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]',
  views INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ads_category ON ads(category_id);
CREATE INDEX ads_created ON ads(created_at);
CREATE TABLE favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, ad_id)
);
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories
INSERT INTO categories (slug, name, icon, position) VALUES ('property', 'Property', '🏠', 0);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'property--apartments-for-sale', 'Apartments for sale', 0 FROM categories WHERE slug = 'property';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'property--apartments-for-rent', 'Apartments for rent', 1 FROM categories WHERE slug = 'property';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'property--houses-for-sale', 'Houses for sale', 2 FROM categories WHERE slug = 'property';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'property--houses-for-rent', 'Houses for rent', 3 FROM categories WHERE slug = 'property';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'property--land-and-plots', 'Land & plots', 4 FROM categories WHERE slug = 'property';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'property--commercial-property', 'Commercial property', 5 FROM categories WHERE slug = 'property';
INSERT INTO categories (slug, name, icon, position) VALUES ('motors', 'Motors', '🚗', 1);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'motors--cars', 'Cars', 0 FROM categories WHERE slug = 'motors';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'motors--motorcycles', 'Motorcycles', 1 FROM categories WHERE slug = 'motors';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'motors--vans-and-trucks', 'Vans & trucks', 2 FROM categories WHERE slug = 'motors';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'motors--boats', 'Boats', 3 FROM categories WHERE slug = 'motors';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'motors--car-parts-and-accessories', 'Car parts & accessories', 4 FROM categories WHERE slug = 'motors';
INSERT INTO categories (slug, name, icon, position) VALUES ('electronics', 'Electronics', '📱', 2);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'electronics--mobile-phones', 'Mobile phones', 0 FROM categories WHERE slug = 'electronics';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'electronics--computers-and-laptops', 'Computers & laptops', 1 FROM categories WHERE slug = 'electronics';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'electronics--tv-and-audio', 'TV & audio', 2 FROM categories WHERE slug = 'electronics';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'electronics--cameras', 'Cameras', 3 FROM categories WHERE slug = 'electronics';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'electronics--video-games-and-consoles', 'Video games & consoles', 4 FROM categories WHERE slug = 'electronics';
INSERT INTO categories (slug, name, icon, position) VALUES ('home-garden', 'Home & Garden', '🛋️', 3);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'home-garden--furniture', 'Furniture', 0 FROM categories WHERE slug = 'home-garden';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'home-garden--appliances', 'Appliances', 1 FROM categories WHERE slug = 'home-garden';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'home-garden--garden', 'Garden', 2 FROM categories WHERE slug = 'home-garden';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'home-garden--home-decor', 'Home decor', 3 FROM categories WHERE slug = 'home-garden';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'home-garden--tools-and-diy', 'Tools & DIY', 4 FROM categories WHERE slug = 'home-garden';
INSERT INTO categories (slug, name, icon, position) VALUES ('fashion', 'Fashion & Beauty', '👗', 4);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'fashion--women-clothing', 'Women clothing', 0 FROM categories WHERE slug = 'fashion';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'fashion--men-clothing', 'Men clothing', 1 FROM categories WHERE slug = 'fashion';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'fashion--shoes', 'Shoes', 2 FROM categories WHERE slug = 'fashion';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'fashion--watches-and-jewellery', 'Watches & jewellery', 3 FROM categories WHERE slug = 'fashion';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'fashion--beauty-and-health', 'Beauty & health', 4 FROM categories WHERE slug = 'fashion';
INSERT INTO categories (slug, name, icon, position) VALUES ('jobs', 'Jobs', '💼', 5);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'jobs--hospitality', 'Hospitality', 0 FROM categories WHERE slug = 'jobs';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'jobs--it-and-telecoms', 'IT & telecoms', 1 FROM categories WHERE slug = 'jobs';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'jobs--sales-and-retail', 'Sales & retail', 2 FROM categories WHERE slug = 'jobs';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'jobs--construction', 'Construction', 3 FROM categories WHERE slug = 'jobs';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'jobs--office-and-admin', 'Office & admin', 4 FROM categories WHERE slug = 'jobs';
INSERT INTO categories (slug, name, icon, position) VALUES ('services', 'Services', '🛠️', 6);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'services--repairs', 'Repairs', 0 FROM categories WHERE slug = 'services';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'services--cleaning', 'Cleaning', 1 FROM categories WHERE slug = 'services';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'services--lessons-and-tutoring', 'Lessons & tutoring', 2 FROM categories WHERE slug = 'services';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'services--moving-and-transport', 'Moving & transport', 3 FROM categories WHERE slug = 'services';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'services--beauty-services', 'Beauty services', 4 FROM categories WHERE slug = 'services';
INSERT INTO categories (slug, name, icon, position) VALUES ('kids', 'Kids & Baby', '🧸', 7);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'kids--toys', 'Toys', 0 FROM categories WHERE slug = 'kids';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'kids--strollers-and-car-seats', 'Strollers & car seats', 1 FROM categories WHERE slug = 'kids';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'kids--kids-clothing', 'Kids clothing', 2 FROM categories WHERE slug = 'kids';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'kids--baby-furniture', 'Baby furniture', 3 FROM categories WHERE slug = 'kids';
INSERT INTO categories (slug, name, icon, position) VALUES ('hobbies', 'Sports & Hobbies', '⚽', 8);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'hobbies--bicycles', 'Bicycles', 0 FROM categories WHERE slug = 'hobbies';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'hobbies--fitness-equipment', 'Fitness equipment', 1 FROM categories WHERE slug = 'hobbies';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'hobbies--musical-instruments', 'Musical instruments', 2 FROM categories WHERE slug = 'hobbies';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'hobbies--books', 'Books', 3 FROM categories WHERE slug = 'hobbies';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'hobbies--camping-and-outdoor', 'Camping & outdoor', 4 FROM categories WHERE slug = 'hobbies';
INSERT INTO categories (slug, name, icon, position) VALUES ('animals', 'Animals', '🐾', 9);
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'animals--dogs', 'Dogs', 0 FROM categories WHERE slug = 'animals';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'animals--cats', 'Cats', 1 FROM categories WHERE slug = 'animals';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'animals--birds', 'Birds', 2 FROM categories WHERE slug = 'animals';
INSERT INTO categories (parent_id, slug, name, position) SELECT id, 'animals--pet-accessories', 'Pet accessories', 3 FROM categories WHERE slug = 'animals';

-- Demo seller (demo@example.com / demo1234) and demo ads
INSERT INTO users (email, name, phone, password_hash) VALUES ('demo@example.com', 'Demo Seller', '+357 99 000000', '857a75e20891168576b4e8dc06cf54c3:6986b34b8856e26b5f315447066534d65e018fea60d34d3c123f5f077de9c9e59d8b15f1f2bef1b9c2afbf76c8290db9975463344fe423681bbbe1760796be35');
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, '2-bedroom apartment near the seafront', 'Bright, fully furnished 2-bedroom apartment, 5 minutes walk from the beach. Covered parking, storage room, A/C in all rooms. Available from next month.', 1150, 'Limassol', true, now() - interval '0 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'property--apartments-for-rent';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, '3-bedroom detached house with garden', 'Detached family house on a 600 m² plot. Open-plan kitchen, fireplace, solar water heater, private garden with fruit trees.', 345000, 'Paphos', true, now() - interval '7 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'property--houses-for-sale';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Residential plot with mountain views', 'Residential plot of 820 m² in a quiet village area, building density 60%. Title deeds available.', 89000, 'Larnaca', false, now() - interval '14 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'property--land-and-plots';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Modern studio in city centre', 'Newly renovated studio, ideal for investment. Close to university and public transport.', 98000, 'Nicosia', false, now() - interval '21 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'property--apartments-for-sale';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Toyota Yaris Hybrid 2019, low mileage', 'One owner, full service history, 48,000 km. Automatic, reversing camera, very economical.', 14500, 'Nicosia', true, now() - interval '28 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'motors--cars';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Mazda CX-5 2017 diesel', 'Well maintained SUV, leather seats, navigation, new tyres. MOT valid until next year.', 16900, 'Limassol', false, now() - interval '35 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'motors--cars';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Honda PCX 125 scooter', 'Perfect city scooter, 2021, 9,000 km, top box included.', 2800, 'Larnaca', false, now() - interval '42 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'motors--motorcycles';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Fishing boat 5.2 m with outboard', '40 HP outboard engine, trailer included, licensed and insured.', 7200, 'Famagusta', false, now() - interval '49 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'motors--boats';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'iPhone 14 128GB, like new', 'Battery health 94%, always used with case and screen protector. Comes with original box.', 520, 'Nicosia', false, now() - interval '56 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'electronics--mobile-phones';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Gaming laptop RTX 3060, 16GB RAM', '15.6" 144Hz screen, 1TB SSD. Works perfectly, selling because I upgraded.', 780, 'Limassol', true, now() - interval '63 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'electronics--computers-and-laptops';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, '55" 4K Smart TV', 'Smart TV with HDR, wall mount included. Remote and original stand.', 330, 'Paphos', false, now() - interval '70 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'electronics--tv-and-audio';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'PlayStation 5 with two controllers', 'Disc edition, includes 3 games. Very good condition.', 420, 'Larnaca', false, now() - interval '77 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'electronics--video-games-and-consoles';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Corner sofa, grey fabric', 'Comfortable L-shaped sofa, 2.8 m × 1.9 m. Pet and smoke free home. Must collect.', 350, 'Nicosia', false, now() - interval '84 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'home-garden--furniture';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Washing machine 8kg, A+++', '3 years old, works great. Can help with transport within the city.', 180, 'Limassol', false, now() - interval '91 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'home-garden--appliances';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Outdoor dining set, 6 chairs', 'Aluminium table with 6 stackable chairs, ideal for verandas.', 260, 'Paphos', false, now() - interval '98 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'home-garden--garden';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Automatic diver watch, stainless steel', 'Worn a handful of times, box and papers included.', 240, 'Larnaca', false, now() - interval '105 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'fashion--watches-and-jewellery';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Running shoes size 43, new', 'Brand new in box, wrong size purchase.', 70, 'Nicosia', false, now() - interval '112 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'fashion--shoes';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Waiter / waitress wanted for summer season', 'Beachfront restaurant seeks experienced staff. English required, Greek is a plus. Full time, good tips.', NULL, 'Famagusta', false, now() - interval '119 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'jobs--hospitality';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Junior web developer', 'Growing agency looking for a junior developer with JavaScript experience. Hybrid work possible.', NULL, 'Limassol', true, now() - interval '126 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'jobs--it-and-telecoms';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Maths & physics private lessons', 'Experienced tutor for GCSE / A-level / Pancyprian exams. Online or in person.', 25, 'Nicosia', false, now() - interval '133 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'services--lessons-and-tutoring';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'House moves island-wide', 'Professional team, packing materials, insured. Free quotation.', NULL, 'Larnaca', false, now() - interval '140 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'services--moving-and-transport';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Travel system stroller + car seat', 'Excellent condition, folds compactly. Rain cover included.', 150, 'Limassol', false, now() - interval '147 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'kids--strollers-and-car-seats';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Mountain bike 29", hydraulic brakes', 'Aluminium frame size L, recently serviced.', 390, 'Paphos', false, now() - interval '154 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'hobbies--bicycles';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Acoustic guitar with case', 'Solid spruce top, great sound. Ideal for beginners and intermediates.', 120, 'Nicosia', false, now() - interval '161 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'hobbies--musical-instruments';
INSERT INTO ads (user_id, category_id, title, description, price, city, featured, created_at)
  SELECT u.id, c.id, 'Large dog crate', 'Foldable metal crate, 106 cm, with plastic tray.', 45, 'Larnaca', false, now() - interval '168 hours'
  FROM users u, categories c WHERE u.email = 'demo@example.com' AND c.slug = 'animals--pet-accessories';
