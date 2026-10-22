// Local development server: same API as production, backed by an embedded
// Postgres (PGlite via @netlify/database-dev) and a folder for photos.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NetlifyDB } from '@netlify/database-dev';
import { createApi } from '../lib/api.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// Minimal stand-in for a Netlify Blobs store. `dir` = null keeps photos in memory.
export function localPhotoStore(dir) {
  const mem = new Map();
  return {
    async set(key, data, { metadata } = {}) {
      if (!dir) return void mem.set(key, { data, metadata });
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, key), Buffer.from(data));
      await fs.writeFile(path.join(dir, key + '.json'), JSON.stringify(metadata ?? {}));
    },
    async getWithMetadata(key) {
      if (!dir) return mem.get(key) ?? null;
      try {
        const data = await fs.readFile(path.join(dir, key));
        const metadata = JSON.parse(await fs.readFile(path.join(dir, key + '.json'), 'utf8'));
        return { data, metadata };
      } catch {
        return null;
      }
    },
    async delete(key) {
      if (!dir) return void mem.delete(key);
      await fs.rm(path.join(dir, key), { force: true });
      await fs.rm(path.join(dir, key + '.json'), { force: true });
    },
  };
}

export async function startServer({ port = 3000, dataDir = path.join(root, 'data') } = {}) {
  const db = new NetlifyDB({ directory: dataDir && path.join(dataDir, 'db'), logger: () => {} });
  await db.start();
  await db.applyMigrations(path.join(root, 'netlify', 'database', 'migrations'));
  const handle = createApi({
    query: async (text, params) => (await db.query(text, params)).rows,
    photos: localPhotoStore(dataDir && path.join(dataDir, 'photos')),
  });

  const server = http.createServer(async (nodeReq, res) => {
    const url = new URL(nodeReq.url, `http://${nodeReq.headers.host}`);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      const chunks = [];
      for await (const c of nodeReq) chunks.push(c);
      const req = new Request(url, {
        method: nodeReq.method,
        headers: nodeReq.headers,
        body: ['GET', 'HEAD'].includes(nodeReq.method) ? undefined : Buffer.concat(chunks),
      });
      const out = await handle(req);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    // Static files, falling back to index.html for client-side routes (like _redirects on Netlify).
    const file = path.join(root, 'public', path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    let body;
    try {
      body = await fs.readFile(file);
    } catch {
      body = await fs.readFile(path.join(root, 'public', 'index.html'));
      return res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(body);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  });

  await new Promise((r) => server.listen(port, r));
  return { server, url: `http://localhost:${server.address().port}`, close: async () => { server.close(); await db.stop(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({ port: Number(process.env.PORT) || 3000 });
  console.log(`Agora classifieds running at ${url}`);
}
