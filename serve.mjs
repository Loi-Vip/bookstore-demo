import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port không hợp lệ.');
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    if (!(await stat(file)).isFile()) throw new Error('Not found');
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Không tìm thấy trang.'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Cổng ${port} đang được dùng. Thử: node serve.mjs 4174` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Mực Comic Store: http://localhost:${port}`));
