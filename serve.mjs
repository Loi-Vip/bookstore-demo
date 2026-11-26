import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { openDatabase } from './server/database.mjs';
import { createApi, bootstrapAdmin, sendJson } from './server/api.mjs';
import { HttpError } from './server/security.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const port = Number(process.argv[2] || process.env.PORT || 4173);
const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port không hợp lệ.');
const context = { window: {} };
vm.runInNewContext(readFileSync(path.join(root, 'catalog.js'), 'utf8'), context);
const databasePath = path.resolve(root, process.env.DB_PATH || 'data/muc.sqlite');
const db = openDatabase(databasePath, context.window.COMIC_CATALOG);
await bootstrapAdmin(db);
const api = createApi(db, root);
const publicFiles = new Set(['index.html', 'styles.css', 'catalog.js', 'catalog-compat.js', 'store.js', 'app.js', 'api.js', 'auth.html', 'auth.js', 'account.css', 'admin/index.html', 'admin/admin.js', 'admin/login.html', 'admin/login.js']);
const pageRoutes = new Map([
  ['/', 'index.html'],
  ['/admin', 'admin/index.html'],
  ['/admin/', 'admin/index.html'],
  ['/admin/login', 'admin/login.html'],
  ['/admin/login/', 'admin/login.html'],
]);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon' };

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await api(request, response, url);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const relative = pageRoutes.get(pathname) || pathname.slice(1);
    const file = path.resolve(root, relative);
    const insideRoot = file.startsWith(root + path.sep);
    const asset = relative.startsWith('assets/') && Object.hasOwn(mime, path.extname(relative)) && !relative.split('/').some(part => part.startsWith('.'));
    if (!insideRoot || (!publicFiles.has(relative) && !asset) || file === databasePath) throw new HttpError(404, 'Không tìm thấy trang.');
    if (!(await stat(file)).isFile()) throw new HttpError(404, 'Không tìm thấy trang.');
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    const status = error.status || (error.code === 'ENOENT' ? 404 : error instanceof URIError ? 400 : 500);
    if (status === 500) console.error('Request failed', error);
    sendJson(response, status, { error: status === 500 ? 'Máy chủ gặp lỗi. Vui lòng thử lại.' : error.message });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Cổng ${port} đang được dùng. Thử node serve.mjs 4174` : error.message);
  db.close();
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Mực Comic Store http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
