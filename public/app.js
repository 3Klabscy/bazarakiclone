'use strict';

const state = { user: null, categories: [], cities: [] };
const $app = document.getElementById('app');

// ---------- Helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const init = { credentials: 'same-origin', ...opts };
  if (opts.body && !(opts.body instanceof FormData)) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status });
  return data;
}

const fmtPrice = (p) => (p === null || p === undefined ? 'Contact for price' : '€' + Number(p).toLocaleString('en-GB', { maximumFractionDigits: 2 }));

function timeAgo(date) {
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 2) return 'yesterday';
  return `${Math.floor(s / 86400)} days ago`;
}

function topCategory(slug) {
  const top = (slug || '').split('--')[0];
  return state.categories.find((c) => c.slug === top);
}

// Placeholder image for ads without photos: a tinted tile with the category icon.
function placeholder(ad) {
  const cat = topCategory(ad.category_slug);
  const hue = ((cat?.id ?? 1) * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue},45%,88%)"/><text x="200" y="175" font-size="96" text-anchor="middle">${cat?.icon ?? '📦'}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
const cover = (ad) => ad.images?.[0] || placeholder(ad);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function navigate(url) {
  history.pushState(null, '', url);
  render();
}

// ---------- Components ----------
function adCard(ad) {
  return `<a class="ad-card" href="/ad/${ad.id}" data-link>
    ${ad.status === 'sold' ? '<span class="badge sold">Sold</span>' : ad.featured ? '<span class="badge">Top</span>' : ''}
    <button class="fav ${ad.favorite ? 'on' : ''}" data-fav="${ad.id}" aria-label="Save to favourites">${ad.favorite ? '♥' : '♡'}</button>
    <img class="thumb" src="${esc(cover(ad))}" alt="" loading="lazy">
    <div class="body">
      <div class="price">${fmtPrice(ad.price)}</div>
      <div class="title">${esc(ad.title)}</div>
      <div class="meta">${esc(ad.city)} · ${timeAgo(ad.created_at)}</div>
    </div>
  </a>`;
}

const adGrid = (ads) => (ads.length ? `<div class="ad-grid">${ads.map(adCard).join('')}</div>` : '<div class="empty">No ads found. Try different filters.</div>');

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = state.user
    ? `<a href="/favorites" data-link>♥ Favourites</a>
       <a href="/messages" data-link>Messages</a>
       <a href="/my" data-link>My ads</a>
       <a href="#" id="logout">Log out</a>
       <a href="/post" class="btn btn-accent" data-link>+ Post ad</a>`
    : `<a href="/login" data-link>Log in</a>
       <a href="/register" data-link>Register</a>
       <a href="/post" class="btn btn-accent" data-link>+ Post ad</a>`;
}

// ---------- Pages ----------
async function homePage() {
  const [featured, latest] = await Promise.all([api('/api/ads?featured=1'), api('/api/ads?sort=newest')]);
  const newest = latest.ads.slice(0, 12);
  $app.innerHTML = `
    <section class="hero">
      <div><h1>Buy and sell anything in Cyprus</h1><p>${latest.total} active ads from people near you.</p></div>
      <a href="/post" class="btn btn-accent" data-link>Post a free ad</a>
    </section>
    <section class="weather" id="weather" hidden></section>
    <h2>Categories</h2>
    <div class="cat-grid">${state.categories.map((c) => `
      <a class="cat-tile" href="/c/${c.slug}" data-link>
        <div class="icon">${c.icon}</div><div class="name">${esc(c.name)}</div><div class="count">${c.ad_count} ads</div>
      </a>`).join('')}</div>
    ${featured.ads.length ? `<h2>Top ads</h2>${adGrid(featured.ads.slice(0, 8))}` : ''}
    <h2>Latest ads</h2>${adGrid(newest)}`;
  renderWeather();
}

// ---------- Weather (Open-Meteo, no API key) ----------
const WEATHER_PLACES = [
  ['Kiti', 34.8486, 33.5714],
  ['Nicosia', 35.1856, 33.3823],
  ['Limassol', 34.6786, 33.0413],
  ['Larnaca', 34.9229, 33.6233],
  ['Paphos', 34.7720, 32.4297],
  ['Famagusta', 35.1174, 33.9419],
];

function weatherLabel(code) {
  if (code === 0) return ['☀️', 'Clear sky'];
  if (code <= 2) return ['🌤️', 'Partly cloudy'];
  if (code === 3) return ['☁️', 'Overcast'];
  if (code <= 48) return ['🌫️', 'Fog'];
  if (code <= 57) return ['🌦️', 'Drizzle'];
  if (code <= 67) return ['🌧️', 'Rain'];
  if (code <= 77) return ['🌨️', 'Snow'];
  if (code <= 82) return ['🌦️', 'Showers'];
  return ['⛈️', 'Thunderstorm'];
}

async function fetchWeather() {
  // Cache for 15 minutes so navigating back to the home page doesn't refetch.
  if (fetchWeather.cache && Date.now() - fetchWeather.cache.at < 15 * 60 * 1000) return fetchWeather.cache.data;
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: WEATHER_PLACES.map((p) => p[1]).join(','),
    longitude: WEATHER_PLACES.map((p) => p[2]).join(','),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    forecast_days: '1',
    timezone: 'Asia/Nicosia',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather unavailable');
  const data = await res.json();
  fetchWeather.cache = { at: Date.now(), data };
  return data;
}

async function renderWeather() {
  const box = document.getElementById('weather');
  try {
    const data = await fetchWeather();
    if (!document.body.contains(box)) return; // user navigated away
    box.innerHTML = `
      <div class="weather-head"><h2>Weather today</h2><span class="source">Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></span></div>
      <div class="weather-row">${data.map((w, i) => {
        const [icon, desc] = weatherLabel(w.current.weather_code);
        return `<div class="wx ${i === 0 ? 'featured' : ''}">
          <div class="place">${esc(WEATHER_PLACES[i][0])}</div>
          <div class="icon" aria-hidden="true">${icon}</div>
          <div class="temp">${Math.round(w.current.temperature_2m)}°C</div>
          <div class="desc">${desc}</div>
          <div class="range">↑${Math.round(w.daily.temperature_2m_max[0])}° ↓${Math.round(w.daily.temperature_2m_min[0])}°</div>
          <div class="range">💨 ${Math.round(w.current.wind_speed_10m)} km/h</div>
        </div>`;
      }).join('')}</div>`;
    box.hidden = false;
  } catch {
    // Weather is a nice-to-have; leave it hidden if the service is unreachable.
  }
}

async function listingPage(categorySlug) {
  const params = new URLSearchParams(location.search);
  if (categorySlug) params.set('category', categorySlug);
  const data = await api('/api/ads?' + params);
  const top = topCategory(categorySlug);
  const sub = top?.children.find((c) => c.slug === categorySlug);
  const q = params.get('q');
  const title = sub ? sub.name : top ? top.name : q ? `Results for “${q}”` : 'All ads';

  const qs = (overrides) => {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(overrides)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    return s ? '?' + s : '';
  };

  $app.innerHTML = `
    <div class="breadcrumbs"><a href="/" data-link>Home</a>${top ? ` › <a href="/c/${top.slug}" data-link>${esc(top.name)}</a>` : ''}${sub ? ` › ${esc(sub.name)}` : ''}</div>
    <h1>${esc(title)} <span class="muted" style="font-size:1rem;font-weight:400">(${data.total})</span></h1>
    ${top ? `<div class="subcats">${top.children.map((c) => `<a class="chip ${c.slug === categorySlug ? 'active' : ''}" href="/c/${c.slug}${qs({ page: '' })}" data-link>${esc(c.name)} · ${c.ad_count}</a>`).join('')}</div>` : ''}
    <div class="listing">
      <form class="filters" id="filters">
        <strong>Filters</strong>
        <label for="f-q">Keyword</label><input id="f-q" name="q" value="${esc(q ?? '')}">
        ${top ? '' : `<label for="f-cat">Category</label><select id="f-cat" name="category"><option value="">Any</option>
          ${state.categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select>`}
        <label for="f-city">City</label><select id="f-city" name="city"><option value="">All Cyprus</option>
          ${state.cities.map((c) => `<option ${params.get('city') === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <label>Price (€)</label>
        <div class="row"><input name="min" type="number" min="0" placeholder="From" value="${esc(params.get('min') ?? '')}">
          <input name="max" type="number" min="0" placeholder="To" value="${esc(params.get('max') ?? '')}"></div>
        <button class="btn" style="width:100%;margin-top:14px">Apply</button>
      </form>
      <div>
        <div class="toolbar"><span class="muted">Page ${data.page} of ${data.pages}</span>
          <select id="sort" aria-label="Sort">
            ${[['', 'Recommended'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['popular', 'Most viewed']]
              .map(([v, l]) => `<option value="${v}" ${(params.get('sort') ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        ${adGrid(data.ads)}
        ${data.pages > 1 ? `<div class="pager">${Array.from({ length: data.pages }, (_, i) => i + 1)
          .map((n) => `<a class="chip ${n === data.page ? 'active' : ''}" href="${location.pathname}${qs({ page: n === 1 ? '' : n })}" data-link>${n}</a>`).join('')}</div>` : ''}
      </div>
    </div>`;

  const catSel = document.getElementById('f-cat');
  if (catSel) catSel.value = params.get('category') ?? '';

  document.getElementById('filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const p = new URLSearchParams();
    for (const [k, v] of fd) if (v) p.set(k, v);
    if (params.get('sort')) p.set('sort', params.get('sort'));
    const cat = p.get('category');
    p.delete('category');
    const base = categorySlug ? location.pathname : cat ? `/c/${cat}` : '/search';
    navigate(base + (p.toString() ? '?' + p : ''));
  });
  document.getElementById('sort').addEventListener('change', (e) => navigate(location.pathname + qs({ sort: e.target.value, page: '' })));
}

async function adPage(id) {
  const ad = await api(`/api/ads/${id}`);
  const images = ad.images.length ? ad.images : [placeholder(ad)];
  const isOwner = state.user?.id === ad.user_id;
  document.title = `${ad.title} — Agora`;
  $app.innerHTML = `
    <div class="breadcrumbs"><a href="/" data-link>Home</a> › <a href="/c/${ad.parent_slug}" data-link>${esc(ad.parent_name)}</a> ›
      <a href="/c/${ad.category_slug}" data-link>${esc(ad.category_name)}</a></div>
    <div class="detail">
      <div class="stack">
        <div class="panel">
          <img class="gallery-main" id="main-img" src="${esc(images[0])}" alt="${esc(ad.title)}">
          ${images.length > 1 ? `<div class="gallery-thumbs">${images.map((src, i) => `<img src="${esc(src)}" data-src="${esc(src)}" class="${i ? '' : 'active'}" alt="Photo ${i + 1}">`).join('')}</div>` : ''}
        </div>
        <div class="panel">
          <h1 style="margin-top:0">${esc(ad.title)}</h1>
          <div class="price">${fmtPrice(ad.price)}</div>
          <dl class="facts">
            <dt>Location</dt><dd>${esc(ad.city)}</dd>
            <dt>Category</dt><dd>${esc(ad.category_name)}</dd>
            <dt>Posted</dt><dd>${timeAgo(ad.created_at)}</dd>
            <dt>Views</dt><dd>${ad.views}</dd>
            <dt>Ad ID</dt><dd>#${ad.id}</dd>
            ${ad.status !== 'active' ? `<dt>Status</dt><dd>${esc(ad.status)}</dd>` : ''}
          </dl>
          <h2>Description</h2>
          <div class="desc">${esc(ad.description)}</div>
        </div>
      </div>
      <aside class="stack">
        <div class="panel seller">
          <div class="seller-head"><div class="avatar">${esc(ad.seller.name[0]?.toUpperCase())}</div>
            <div><strong>${esc(ad.seller.name)}</strong><div class="muted" style="font-size:.85rem">On Agora since ${new Date(ad.seller.created_at).getFullYear()} · ${ad.seller.ad_count} ads</div></div></div>
          <div class="stack">
            ${ad.seller.phone ? `<button class="btn" id="show-phone">📞 Show phone number</button>` : ''}
            <button class="btn btn-ghost" data-fav="${ad.id}">${ad.favorite ? '♥ Saved' : '♡ Save to favourites'}</button>
            <a class="btn btn-ghost" href="/search?user=${ad.user_id}" data-link style="text-align:center">All ads by this seller</a>
          </div>
        </div>
        ${isOwner ? `<div class="panel"><strong>This is your ad</strong><p><a href="/my" data-link>Manage it in My ads</a></p></div>` : `
        <form class="panel" id="msg-form">
          <strong>Message the seller</strong>
          <textarea name="body" required style="margin-top:8px;min-height:90px">Hi, is this still available?</textarea>
          <button class="btn" style="margin-top:8px;width:100%">Send message</button>
        </form>`}
        <div class="panel muted" style="font-size:.85rem">Safety tip: never pay in advance. Inspect the item and meet in a public place.</div>
      </aside>
    </div>`;

  document.querySelectorAll('.gallery-thumbs img').forEach((img) => img.addEventListener('click', () => {
    document.getElementById('main-img').src = img.dataset.src;
    document.querySelectorAll('.gallery-thumbs img').forEach((i) => i.classList.toggle('active', i === img));
  }));
  document.getElementById('show-phone')?.addEventListener('click', (e) => {
    e.target.outerHTML = `<a class="btn" href="tel:${esc(ad.seller.phone.replace(/\s/g, ''))}">📞 ${esc(ad.seller.phone)}</a>`;
  });
  document.getElementById('msg-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return navigate('/login?next=' + encodeURIComponent(location.pathname));
    try {
      await api(`/api/ads/${ad.id}/messages`, { method: 'POST', body: { body: e.target.body.value } });
      e.target.body.value = '';
      toast('Message sent');
    } catch (err) { toast(err.message); }
  });
}

function authPage(mode) {
  const reg = mode === 'register';
  $app.innerHTML = `
    <form class="panel form-card narrow" id="auth-form">
      <h1 style="margin-top:0">${reg ? 'Create an account' : 'Log in'}</h1>
      <div id="err"></div>
      ${reg ? `<div class="field"><label for="a-name">Name</label><input id="a-name" name="name" required autocomplete="name"></div>
               <div class="field"><label for="a-phone">Phone (shown on your ads)</label><input id="a-phone" name="phone" autocomplete="tel" placeholder="+357 …"></div>` : ''}
      <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="a-pass">Password</label><input id="a-pass" name="password" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
      <button class="btn" style="width:100%">${reg ? 'Register' : 'Log in'}</button>
      <p class="muted" style="text-align:center">${reg ? 'Already have an account? <a href="/login" data-link>Log in</a>' : 'New here? <a href="/register" data-link>Create an account</a>'}</p>
    </form>`;
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.user = await api(`/api/${reg ? 'register' : 'login'}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      renderNav();
      navigate(new URLSearchParams(location.search).get('next') || '/');
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  });
}

function categoryOptions(selected) {
  return state.categories.map((c) => `<optgroup label="${esc(c.icon + ' ' + c.name)}">
    ${c.children.map((s) => `<option value="${s.slug}" ${s.slug === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
  </optgroup>`).join('');
}

// Resize photos in the browser so uploads stay small (the server accepts at most 2 MB per photo).
async function shrinkImage(file, maxSide = 1600) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

function postPage() {
  if (!state.user) return navigate('/login?next=/post');
  $app.innerHTML = `
    <form class="panel form-card" id="post-form">
      <h1 style="margin-top:0">Post a free ad</h1>
      <div id="err"></div>
      <div class="field"><label for="p-cat">Category</label>
        <select id="p-cat" name="category" required><option value="">Choose a category…</option>${categoryOptions()}</select></div>
      <div class="field"><label for="p-title">Title</label><input id="p-title" name="title" required minlength="3" maxlength="100"></div>
      <div class="field"><label for="p-desc">Description</label><textarea id="p-desc" name="description" required minlength="10"></textarea></div>
      <div class="field"><label for="p-price">Price (€)</label><input id="p-price" name="price" type="number" min="0" step="0.01">
        <div class="hint">Leave empty for “Contact for price”.</div></div>
      <div class="field"><label for="p-city">City</label><select id="p-city" name="city" required><option value="">Choose…</option>
        ${state.cities.map((c) => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label for="p-img">Photos</label><input id="p-img" name="images" type="file" accept="image/*" multiple>
        <div class="hint">Up to 8 photos. The first photo is the cover.</div><div class="previews" id="previews"></div></div>
      <button class="btn btn-accent" style="width:100%">Publish ad</button>
    </form>`;
  document.getElementById('p-img').addEventListener('change', (e) => {
    document.getElementById('previews').innerHTML = [...e.target.files].slice(0, 8).map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
  });
  document.getElementById('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const fd = new FormData(e.target);
      const photos = fd.getAll('images').filter((f) => f.size > 0).slice(0, 8);
      fd.delete('images');
      for (const f of photos) fd.append('images', await shrinkImage(f), f.name.replace(/\.\w+$/, '') + '.jpg');
      const { id } = await api('/api/ads', { method: 'POST', body: fd });
      toast('Your ad is live!');
      navigate(`/ad/${id}`);
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="error">${esc(err.message)}</div>`;
      btn.disabled = false;
    }
  });
}

async function myAdsPage() {
  if (!state.user) return navigate('/login?next=/my');
  const ads = await api('/api/my/ads');
  $app.innerHTML = `<h1>My ads</h1>
    ${ads.length ? `<div class="my-list">${ads.map((ad) => `
      <div class="my-item" data-id="${ad.id}">
        <img src="${esc(cover(ad))}" alt="">
        <div class="grow"><a href="/ad/${ad.id}" data-link><strong>${esc(ad.title)}</strong></a>
          <div class="muted">${fmtPrice(ad.price)} · ${esc(ad.city)} · ${ad.views} views · <strong>${esc(ad.status)}</strong></div></div>
        <div class="actions">
          <button class="btn btn-ghost" data-act="edit">Edit</button>
          ${ad.status === 'active' ? '<button class="btn btn-ghost" data-act="sold">Mark sold</button>' : '<button class="btn btn-ghost" data-act="active">Reactivate</button>'}
          <button class="btn btn-danger" data-act="delete">Delete</button>
        </div>
      </div>`).join('')}</div>` : '<div class="empty">You have no ads yet. <a href="/post" data-link>Post your first ad</a>.</div>'}`;

  $app.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('.my-item').dataset.id;
    const act = b.dataset.act;
    try {
      if (act === 'edit') return navigate(`/edit/${id}`);
      if (act === 'delete') {
        if (!confirm('Delete this ad permanently?')) return;
        await api(`/api/ads/${id}`, { method: 'DELETE' });
        toast('Ad deleted');
      } else {
        await api(`/api/ads/${id}`, { method: 'PATCH', body: { status: act } });
        toast(act === 'sold' ? 'Marked as sold' : 'Ad reactivated');
      }
      myAdsPage();
    } catch (err) { toast(err.message); }
  }));
}

async function editPage(id) {
  if (!state.user) return navigate('/login?next=' + encodeURIComponent(location.pathname));
  const ad = await api(`/api/ads/${id}`);
  if (ad.user_id !== state.user.id) return navigate(`/ad/${id}`);
  $app.innerHTML = `
    <form class="panel form-card" id="edit-form">
      <h1 style="margin-top:0">Edit ad</h1>
      <div id="err"></div>
      <div class="field"><label for="e-cat">Category</label><select id="e-cat" name="category" required>${categoryOptions(ad.category_slug)}</select></div>
      <div class="field"><label for="e-title">Title</label><input id="e-title" name="title" required value="${esc(ad.title)}"></div>
      <div class="field"><label for="e-desc">Description</label><textarea id="e-desc" name="description" required>${esc(ad.description)}</textarea></div>
      <div class="field"><label for="e-price">Price (€)</label><input id="e-price" name="price" type="number" min="0" step="0.01" value="${ad.price ?? ''}"></div>
      <div class="field"><label for="e-city">City</label><select id="e-city" name="city">
        ${state.cities.map((c) => `<option ${c === ad.city ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <button class="btn" style="width:100%">Save changes</button>
    </form>`;
  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/ads/${id}`, { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) });
      toast('Saved');
      navigate(`/ad/${id}`);
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  });
}

async function favoritesPage() {
  if (!state.user) return navigate('/login?next=/favorites');
  const ads = await api('/api/favorites');
  $app.innerHTML = `<h1>Favourites</h1>${ads.length ? adGrid(ads) : '<div class="empty">Tap ♡ on any ad to save it here.</div>'}`;
}

async function messagesPage() {
  if (!state.user) return navigate('/login?next=/messages');
  const msgs = await api('/api/messages');
  $app.innerHTML = `<h1>Messages</h1>
    ${msgs.length ? `<div class="stack">${msgs.map((m) => {
      const incoming = m.to_user_id === state.user.id;
      return `<div class="msg">
        <div class="head">${incoming ? `From <strong>${esc(m.from_name)}</strong>` : `To <strong>${esc(m.to_name)}</strong>`}
          about <a href="/ad/${m.ad_id}" data-link>${esc(m.ad_title)}</a> · ${timeAgo(m.created_at)}</div>
        <div>${esc(m.body)}</div>
        ${incoming ? `<form class="reply" data-ad="${m.ad_id}" data-to="${m.from_user_id}" style="display:flex;gap:6px;margin-top:8px">
          <input name="body" placeholder="Write a reply…" required><button class="btn">Reply</button></form>` : ''}
      </div>`;
    }).join('')}</div>` : '<div class="empty">No messages yet.</div>'}`;
  $app.querySelectorAll('form.reply').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/ads/${f.dataset.ad}/messages`, { method: 'POST', body: { body: f.body.value, to: f.dataset.to } });
      toast('Reply sent');
      messagesPage();
    } catch (err) { toast(err.message); }
  }));
}

// ---------- Router ----------
const routes = [
  [/^\/$/, homePage],
  [/^\/c\/([\w-]+)$/, listingPage],
  [/^\/search$/, () => listingPage(null)],
  [/^\/ad\/(\d+)$/, adPage],
  [/^\/edit\/(\d+)$/, editPage],
  [/^\/post$/, postPage],
  [/^\/login$/, () => authPage('login')],
  [/^\/register$/, () => authPage('register')],
  [/^\/my$/, myAdsPage],
  [/^\/favorites$/, favoritesPage],
  [/^\/messages$/, messagesPage],
];

async function render() {
  document.title = 'Agora — Cyprus classifieds';
  const form = document.getElementById('search-form');
  const params = new URLSearchParams(location.search);
  form.q.value = params.get('q') ?? '';
  form.city.value = params.get('city') ?? '';
  for (const [re, page] of routes) {
    const m = location.pathname.match(re);
    if (m) {
      try {
        await page(...m.slice(1));
      } catch (err) {
        $app.innerHTML = `<div class="empty"><h1>${err.status === 404 ? 'Not found' : 'Error'}</h1><p>${esc(err.message)}</p><a href="/" data-link>Back to home</a></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  $app.innerHTML = '<div class="empty"><h1>Page not found</h1><a href="/" data-link>Back to home</a></div>';
}

document.addEventListener('click', async (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    if (!state.user) return navigate('/login?next=' + encodeURIComponent(location.pathname));
    const on = !(fav.classList.contains('on') || fav.textContent.includes('Saved'));
    try {
      await api(`/api/favorites/${fav.dataset.fav}`, { method: on ? 'POST' : 'DELETE' });
      if (fav.classList.contains('fav')) {
        fav.classList.toggle('on', on);
        fav.textContent = on ? '♥' : '♡';
      } else {
        fav.textContent = on ? '♥ Saved' : '♡ Save to favourites';
      }
      toast(on ? 'Saved to favourites' : 'Removed from favourites');
    } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.id === 'logout') {
    e.preventDefault();
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    renderNav();
    return navigate('/');
  }
  const link = e.target.closest('a[data-link]');
  if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    navigate(link.getAttribute('href'));
  }
});

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = new URLSearchParams();
  if (e.target.q.value.trim()) p.set('q', e.target.q.value.trim());
  if (e.target.city.value) p.set('city', e.target.city.value);
  navigate('/search' + (p.toString() ? '?' + p : ''));
});

window.addEventListener('popstate', render);

(async function init() {
  [state.user, state.categories, state.cities] = await Promise.all([api('/api/me'), api('/api/categories'), api('/api/cities')]);
  document.querySelector('#search-form select').insertAdjacentHTML('beforeend', state.cities.map((c) => `<option>${c}</option>`).join(''));
  renderNav();
  render();
})();
