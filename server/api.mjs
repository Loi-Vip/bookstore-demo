import { randomUUID } from 'node:crypto';
import { listProducts } from './database.mjs';
import { createProduct, updateProduct, createOrder, listOrders, updateOrder, dashboard } from './commerce.mjs';
import { ADMIN_SESSION_COOKIE, HttpError, usernameValues, validatePassword, hashPassword, verifyPassword, publicUser, currentUser, requireUser, startSession, endSession, checkMutationRequest, readJson, checkAuthRate } from './security.mjs';

export function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}

export async function bootstrapAdmin(db) {
  const { ADMIN_USERNAME: name, ADMIN_PASSWORD: password } = process.env;
  if (!name && !password) return;
  if (!name || !password) throw new Error('Cần khai báo cả ADMIN_USERNAME và ADMIN_PASSWORD để tạo quản trị viên.');
  const values = usernameValues(name);
  validatePassword(password);
  const existing = db.prepare('SELECT role FROM users WHERE username_key = ?').get(values.key);
  if (existing) {
    if (existing.role !== 'admin') throw new Error('Tên quản trị viên đã thuộc về một khách hàng. Hãy chọn ADMIN_USERNAME khác.');
    return;
  }
  const encoded = await hashPassword(password);
  db.prepare('INSERT INTO users (id, username, username_key, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), values.username, values.key, encoded, 'admin', new Date().toISOString());
  console.log(`Đã tạo tài khoản quản trị ${values.username}.`);
}

export function createApi(db, root) {
  const dummyHashPromise = hashPassword(randomUUID());
  return async function api(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      db.prepare('SELECT 1').get();
      sendJson(response, 200, { ok: true });
      return;
    }
    const user = currentUser(db, request);
    const mutation = !['GET', 'HEAD'].includes(request.method);
    let body;
    if (mutation) {
      checkMutationRequest(request);
      if (['/api/auth/login', '/api/auth/register', '/api/admin/auth/login'].includes(url.pathname)) checkAuthRate(request);
      body = await readJson(request);
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      sendJson(response, 200, { user });
    } else if (request.method === 'GET' && url.pathname === '/api/admin/auth/me') {
      const admin = currentUser(db, request, ADMIN_SESSION_COOKIE);
      sendJson(response, 200, { user: admin?.role === 'admin' ? admin : null });
    } else if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const { username, key } = usernameValues(body.username);
      validatePassword(body.password);
      if (db.prepare('SELECT id FROM users WHERE username_key = ?').get(key)) throw new HttpError(409, 'Tên đăng nhập đã được sử dụng.');
      const passwordHash = await hashPassword(body.password);
      const account = { id: randomUUID(), username, role: 'customer' };
      try {
        db.prepare('INSERT INTO users (id, username, username_key, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(account.id, username, key, passwordHash, 'customer', new Date().toISOString());
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed: users.username_key')) throw new HttpError(409, 'Tên đăng nhập đã được sử dụng.');
        throw error;
      }
      startSession(db, request, response, account.id);
      sendJson(response, 201, { user: account });
    } else if (request.method === 'POST' && ['/api/auth/login', '/api/admin/auth/login'].includes(url.pathname)) {
      const { key } = usernameValues(body.username);
      const account = db.prepare('SELECT * FROM users WHERE username_key = ?').get(key);
      const matched = await verifyPassword(body.password, account?.password_hash || await dummyHashPromise);
      if (!account || !matched) throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu chưa đúng.');
      const adminLogin = url.pathname === '/api/admin/auth/login';
      if (adminLogin && account.role !== 'admin') throw new HttpError(403, 'Tài khoản này không có quyền quản trị.');
      startSession(db, request, response, account.id, adminLogin ? ADMIN_SESSION_COOKIE : 'muc_session');
      sendJson(response, 200, { user: publicUser(account) });
    } else if (request.method === 'POST' && url.pathname === '/api/admin/auth/logout') {
      endSession(db, request, response, ADMIN_SESSION_COOKIE);
      if (user?.role === 'admin') endSession(db, request, response);
      sendJson(response, 200, { user: null });
    } else if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      endSession(db, request, response);
      sendJson(response, 200, { user: null });
    } else if (request.method === 'GET' && url.pathname === '/api/products') {
      sendJson(response, 200, { products: listProducts(db) });
    } else if (request.method === 'GET' && url.pathname === '/api/orders') {
      requireUser(user);
      sendJson(response, 200, { orders: listOrders(db, user.id) });
    } else if (request.method === 'POST' && url.pathname === '/api/orders') {
      requireUser(user);
      sendJson(response, 201, createOrder(db, user, body));
    } else if (url.pathname.startsWith('/api/admin/')) {
      const hasAdminSession = request.headers.cookie?.split(';').some(cookie => cookie.trim().startsWith(`${ADMIN_SESSION_COOKIE}=`));
      requireUser(hasAdminSession ? currentUser(db, request, ADMIN_SESSION_COOKIE) : user, 'admin');
      if (request.method === 'GET' && url.pathname === '/api/admin/dashboard') {
        sendJson(response, 200, dashboard(db, url.searchParams));
      } else if (request.method === 'GET' && url.pathname === '/api/admin/products') {
        sendJson(response, 200, { products: listProducts(db, true) });
      } else if (request.method === 'POST' && url.pathname === '/api/admin/products') {
        sendJson(response, 201, { product: createProduct(db, body, root) });
      } else if (request.method === 'PATCH' && /^\/api\/admin\/products\/[^/]+$/.test(url.pathname)) {
        sendJson(response, 200, { product: updateProduct(db, decodeURIComponent(url.pathname.split('/').at(-1)), body, root) });
      } else if (request.method === 'PATCH' && /^\/api\/admin\/orders\/[^/]+$/.test(url.pathname)) {
        sendJson(response, 200, { order: updateOrder(db, decodeURIComponent(url.pathname.split('/').at(-1)), body.status) });
      } else {
        throw new HttpError(404, 'Không tìm thấy chức năng quản trị.');
      }
    } else {
      throw new HttpError(404, 'Không tìm thấy chức năng này.');
    }
  };
}
