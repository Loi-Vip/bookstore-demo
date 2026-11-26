import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = path.resolve(os.tmpdir());
const password = 'Matkhau123!';
const recipient = { name: 'Khách thử nghiệm', phone: '0901234567', address: '123 Đường Mẫu, Phường Mẫu, Hà Nội' };

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

function client(baseUrl) {
  const cookies = new Map();
  return {
    get cookie() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); },
    set cookie(value) {
      cookies.clear();
      for (const pair of value.split(/;\s*/)) {
        const separator = pair.indexOf('=');
        if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    },
    async request(route, { method = 'GET', body, rawBody, headers = {}, mutationHeader = true } = {}) {
      const requestHeaders = { ...headers };
      if (this.cookie) requestHeaders.Cookie = this.cookie;
      if (method !== 'GET' && method !== 'HEAD') {
        requestHeaders['Content-Type'] ??= 'application/json';
        if (mutationHeader) requestHeaders['X-Muc-Request'] = '1';
      }
      const response = await fetch(baseUrl + route, {
        method,
        headers: requestHeaders,
        body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
        redirect: 'manual',
      });
      for (const setCookie of response.headers.getSetCookie()) {
        const pair = setCookie.split(';')[0];
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (!value || /max-age=0(?:;|$)/i.test(setCookie)) cookies.delete(name);
        else cookies.set(name, value);
      }
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = null; }
      return { status: response.status, data, headers: response.headers, text };
    },
  };
}

function success(result, message = result.text) {
  assert.ok(result.status >= 200 && result.status < 300, `Expected success, received ${result.status}: ${message}`);
  return result.data;
}

function invalid(result) {
  assert.ok([400, 413, 415, 422].includes(result.status), `Expected invalid input, received ${result.status}: ${result.text}`);
}

test('accounts, administration and orders remain consistent across requests and restarts', { timeout: 120_000 }, async t => {
  const databaseDirectory = await mkdtemp(path.join(temporaryRoot, 'muc-backend-tests-'));
  const databasePath = path.join(databaseDirectory, 'store.sqlite');
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server;
  let serverLog = '';

  async function startServer() {
    server = spawn(process.execPath, ['serve.mjs', String(port)], {
      cwd: project,
      windowsHide: true,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test', DB_PATH: databasePath, ADMIN_USERNAME: 'admin.test', ADMIN_PASSWORD: password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12_000); });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Server exited before it became ready.\n${serverLog}`);
      try {
        if ((await fetch(baseUrl + '/api/health')).ok) return;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    throw new Error(`Server did not become ready.\n${serverLog}`);
  }

  async function stopServer() {
    if (!server || server.exitCode !== null) return;
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }

  t.after(async () => {
    await stopServer();
    const resolved = path.resolve(databaseDirectory);
    assert.ok(resolved.startsWith(temporaryRoot + path.sep), 'Test cleanup must remain inside the temporary directory');
    await rm(resolved, { recursive: true, force: true });
  });

  await startServer();
  const anonymous = client(baseUrl);
  const customer = client(baseUrl);
  const otherCustomer = client(baseUrl);
  const admin = client(baseUrl);
  let product;
  let placedOrder;
  let requestKey;

  await t.test('serves catalog and admin entry points while denying internal files', async () => {
    const catalog = success(await anonymous.request('/api/products'));
    assert.equal(catalog.products.length, 14);
    assert.equal(success(await anonymous.request('/api/auth/me')).user, null);
    for (const route of ['/', '/admin', '/admin/', '/admin/login', '/admin/login.html', '/auth.html']) {
      const response = await anonymous.request(route);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
    }
    for (const route of ['/.env', '/.git/config', '/serve.mjs', '/server/database.mjs', '/data/store.sqlite', '/tests/backend.test.mjs']) {
      const response = await anonymous.request(route);
      assert.ok([403, 404].includes(response.status), `${route} exposed internal content with ${response.status}`);
    }
  });

  await t.test('rejects passwords shorter than eight characters and accepts eight', async () => {
    invalid(await customer.request('/api/auth/register', { method: 'POST', body: { username: 'KhachHang', password: '1234567' } }));
    const result = await customer.request('/api/auth/register', { method: 'POST', body: { username: 'KhachHang', password: '12345678' } });
    const registered = success(result);
    assert.equal(registered.user.role, 'customer');
    assert.match(result.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(result.headers.get('set-cookie'), /SameSite=Lax/i);
    assert.ok(customer.cookie.startsWith('muc_session='));
  });

  await t.test('enforces normalized username uniqueness even for competing requests', async () => {
    const duplicate = await anonymous.request('/api/auth/register', { method: 'POST', body: { username: 'ＫＨＡＣＨＨＡＮＧ', password } });
    assert.equal(duplicate.status, 409, duplicate.text);
    const competing = await Promise.all(['Race.User', 'race.user'].map(username => client(baseUrl).request('/api/auth/register', { method: 'POST', body: { username, password } })));
    assert.equal(competing.filter(result => result.status >= 200 && result.status < 300).length, 1);
    assert.equal(competing.filter(result => result.status === 409).length, 1);
    invalid(await anonymous.request('/api/auth/register', { method: 'POST', body: { username: 'ab', password } }));
    invalid(await anonymous.request('/api/auth/register', { method: 'POST', body: { username: 'bad user name', password } }));
  });

  await t.test('keeps registration customer-only and separates administration', async () => {
    const response = await otherCustomer.request('/api/auth/register', { method: 'POST', body: { username: 'OtherCustomer', password, role: 'admin' } });
    if ([400, 422].includes(response.status)) {
      success(await otherCustomer.request('/api/auth/register', { method: 'POST', body: { username: 'OtherCustomer', password } }));
    } else {
      assert.equal(success(response).user.role, 'customer');
    }
    assert.equal(success(await otherCustomer.request('/api/auth/me')).user.role, 'customer');
    assert.equal((await anonymous.request('/api/admin/products')).status, 401);
    assert.equal((await customer.request('/api/admin/products')).status, 403);
    assert.equal((await customer.request('/api/admin/dashboard')).status, 403);
    const signedIn = success(await admin.request('/api/auth/login', { method: 'POST', body: { username: 'ADMIN.TEST', password } }));
    assert.equal(signedIn.user.role, 'admin');
    assert.equal(success(await admin.request('/api/admin/auth/me')).user, null);
  });

  await t.test('keeps administrator and customer sessions independent in one browser', async () => {
    const sharedBrowser = client(baseUrl);
    success(await sharedBrowser.request('/api/auth/login', { method: 'POST', body: { username: 'khachhang', password: '12345678' } }));
    const customerCookie = sharedBrowser.cookie;
    const rejected = await sharedBrowser.request('/api/admin/auth/login', { method: 'POST', body: { username: 'khachhang', password: '12345678' } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('set-cookie'), null);
    assert.equal(sharedBrowser.cookie, customerCookie);
    assert.equal(success(await sharedBrowser.request('/api/admin/auth/me')).user, null);
    assert.equal((await sharedBrowser.request('/api/admin/auth/login', { method: 'POST', body: { username: 'admin.test', password: 'wrong-password' } })).status, 401);
    const login = await sharedBrowser.request('/api/admin/auth/login', { method: 'POST', body: { username: 'ADMIN.TEST', password } });
    assert.equal(success(login).user.role, 'admin');
    assert.match(login.headers.get('set-cookie'), /muc_admin_session=/);
    assert.match(login.headers.get('set-cookie'), /Path=\/api(?:;|$)/i);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
    assert.ok(sharedBrowser.cookie.includes(customerCookie));
    assert.equal(success(await sharedBrowser.request('/api/auth/me')).user.username, 'KhachHang');
    assert.equal(success(await sharedBrowser.request('/api/admin/auth/me')).user.username, 'admin.test');
    success(await sharedBrowser.request('/api/admin/products'));

    success(await sharedBrowser.request('/api/auth/logout', { method: 'POST', body: {} }));
    assert.equal(success(await sharedBrowser.request('/api/auth/me')).user, null);
    assert.equal(success(await sharedBrowser.request('/api/admin/auth/me')).user.role, 'admin');
    success(await sharedBrowser.request('/api/admin/products'));

    success(await sharedBrowser.request('/api/auth/login', { method: 'POST', body: { username: 'khachhang', password: '12345678' } }));
    const copiedAdminSession = client(baseUrl);
    copiedAdminSession.cookie = sharedBrowser.cookie;
    const logout = await sharedBrowser.request('/api/admin/auth/logout', { method: 'POST', body: {} });
    success(logout);
    assert.match(logout.headers.get('set-cookie'), /muc_admin_session=/);
    assert.match(logout.headers.get('set-cookie'), /Path=\/api(?:;|$)/i);
    assert.equal(success(await sharedBrowser.request('/api/admin/auth/me')).user, null);
    assert.equal(success(await sharedBrowser.request('/api/auth/me')).user.role, 'customer');
    assert.equal((await sharedBrowser.request('/api/admin/products')).status, 403);
    assert.equal(success(await copiedAdminSession.request('/api/admin/auth/me')).user, null);
    assert.equal((await copiedAdminSession.request('/api/admin/products')).status, 401);
    copiedAdminSession.cookie += '; ' + admin.cookie;
    assert.equal((await copiedAdminSession.request('/api/admin/products')).status, 401, 'A revoked dedicated admin session must not fall back to a legacy session');
  });

  await t.test('administrator logout revokes dedicated and legacy administrator sessions together', async () => {
    const sharedBrowser = client(baseUrl);
    success(await sharedBrowser.request('/api/auth/login', { method: 'POST', body: { username: 'admin.test', password } }));
    const copiedLegacySession = client(baseUrl);
    copiedLegacySession.cookie = sharedBrowser.cookie;
    success(await sharedBrowser.request('/api/admin/auth/login', { method: 'POST', body: { username: 'admin.test', password } }));
    assert.ok(sharedBrowser.cookie.includes('muc_session='));
    assert.ok(sharedBrowser.cookie.includes('muc_admin_session='));
    const logout = await sharedBrowser.request('/api/admin/auth/logout', { method: 'POST', body: {} });
    success(logout);
    const clearedCookies = logout.headers.getSetCookie();
    assert.equal(clearedCookies.length, 2);
    assert.ok(clearedCookies.some(cookie => /^muc_session=;/.test(cookie) && /Max-Age=0(?:;|$)/i.test(cookie)));
    assert.ok(clearedCookies.some(cookie => /^muc_admin_session=;/.test(cookie) && /Max-Age=0(?:;|$)/i.test(cookie)));
    assert.equal(sharedBrowser.cookie, '');
    assert.equal(success(await sharedBrowser.request('/api/auth/me')).user, null);
    assert.equal(success(await sharedBrowser.request('/api/admin/auth/me')).user, null);
    assert.equal((await sharedBrowser.request('/api/admin/products')).status, 401);
    assert.equal(success(await copiedLegacySession.request('/api/auth/me')).user, null);
    assert.equal((await copiedLegacySession.request('/api/admin/products')).status, 401);
  });

  await t.test('revokes sessions on logout and rejects incorrect credentials', async () => {
    const previousCookie = customer.cookie;
    success(await customer.request('/api/auth/logout', { method: 'POST', body: {} }));
    const copiedSession = client(baseUrl);
    copiedSession.cookie = previousCookie;
    assert.equal(success(await copiedSession.request('/api/auth/me')).user, null);
    assert.equal((await customer.request('/api/auth/login', { method: 'POST', body: { username: 'khachhang', password: 'wrong-password' } })).status, 401);
    assert.equal(success(await customer.request('/api/auth/login', { method: 'POST', body: { username: 'khachhang', password: '12345678' } })).user.role, 'customer');
    assert.notEqual(customer.cookie, previousCookie);
  });

  await t.test('rejects cross-origin changes, missing request headers and malformed JSON', async () => {
    const login = { username: 'khachhang', password: '12345678' };
    assert.equal((await anonymous.request('/api/auth/login', { method: 'POST', body: login, mutationHeader: false })).status, 403);
    assert.equal((await anonymous.request('/api/auth/login', { method: 'POST', body: login, headers: { Origin: 'https://unrelated.example' } })).status, 403);
    invalid(await anonymous.request('/api/auth/login', { method: 'POST', rawBody: '{malformed' }));
    invalid(await anonymous.request('/api/auth/login', { method: 'POST', rawBody: 'null' }));
    const adminLogin = { username: 'admin.test', password };
    assert.equal((await anonymous.request('/api/admin/auth/login', { method: 'POST', body: adminLogin, mutationHeader: false })).status, 403);
    assert.equal((await anonymous.request('/api/admin/auth/login', { method: 'POST', body: adminLogin, headers: { Origin: 'https://unrelated.example' } })).status, 403);
    invalid(await anonymous.request('/api/admin/auth/login', { method: 'POST', rawBody: '{malformed' }));
    assert.equal(success(await customer.request('/api/auth/me')).user.role, 'customer');
  });

  await t.test('publishes and withdraws products with validation and role checks', async () => {
    const draft = { series: 'Bộ truyện kiểm thử', volume: 'Tập 01', author: 'Tác giả mẫu', category: 'manga', format: 'single', price: 100_000, originalPrice: 120_000, stock: 5, description: 'Nội dung sản phẩm dùng trong kiểm thử tích hợp.', image: 'assets/covers/two-piece-01.svg', active: true, featured: false };
    assert.equal((await customer.request('/api/admin/products', { method: 'POST', body: draft })).status, 403);
    product = success(await admin.request('/api/admin/products', { method: 'POST', body: draft })).product;
    assert.ok(product.id);
    assert.equal(product.stock, 5);
    assert.ok(success(await anonymous.request('/api/products')).products.some(row => row.id === product.id));
    success(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { active: false } }));
    assert.ok(!success(await anonymous.request('/api/products')).products.some(row => row.id === product.id));
    assert.equal(success(await admin.request('/api/admin/products')).products.find(row => row.id === product.id).active, false);
    success(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { active: true } }));
    invalid(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { price: -1 } }));
    invalid(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { stock: 1.5 } }));
    invalid(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { image: 'javascript:alert(1)' } }));
  });

  await t.test('calculates order totals on the server and isolates customer histories', async () => {
    requestKey = randomUUID();
    const payload = { items: [{ id: product.id, quantity: 2, price: 1 }], coupon: 'MUC10', customer: recipient, idempotencyKey: requestKey, totals: { total: 1 } };
    assert.equal((await anonymous.request('/api/orders', { method: 'POST', body: payload })).status, 401);
    placedOrder = success(await customer.request('/api/orders', { method: 'POST', body: payload })).order;
    assert.equal(placedOrder.status, 'pending');
    assert.equal(placedOrder.totals.subtotal, 200_000);
    assert.equal(placedOrder.totals.discount, 20_000);
    assert.equal(placedOrder.totals.shipping, 25_000);
    assert.equal(placedOrder.totals.total, 205_000);
    assert.equal(placedOrder.items[0].price, 100_000);
    assert.equal(success(await anonymous.request('/api/products')).products.find(row => row.id === product.id).stock, 3);
    assert.equal(success(await customer.request('/api/orders')).orders.length, 1);
    assert.equal(success(await otherCustomer.request('/api/orders')).orders.length, 0);
    assert.equal((await otherCustomer.request('/api/admin/orders/' + placedOrder.id, { method: 'PATCH', body: { status: 'completed' } })).status, 403);
    invalid(await customer.request('/api/orders', { method: 'POST', body: { ...payload, idempotencyKey: randomUUID(), customer: { ...recipient, phone: '123' } } }));
    invalid(await customer.request('/api/orders', { method: 'POST', body: { ...payload, idempotencyKey: randomUUID(), items: [{ id: product.id, quantity: -1 }] } }));
  });

  await t.test('makes order retries idempotent without reducing inventory twice', async () => {
    const samePayload = { items: [{ id: product.id, quantity: 2, price: 1 }], coupon: 'MUC10', customer: recipient, idempotencyKey: requestKey, totals: { total: 1 } };
    const repeated = await Promise.all([customer.request('/api/orders', { method: 'POST', body: samePayload }), customer.request('/api/orders', { method: 'POST', body: samePayload })]);
    repeated.forEach(response => assert.equal(success(response).order.id, placedOrder.id));
    assert.equal(success(await customer.request('/api/orders')).orders.length, 1);
    assert.equal(success(await anonymous.request('/api/products')).products.find(row => row.id === product.id).stock, 3);
    assert.equal((await customer.request('/api/orders', { method: 'POST', body: { ...samePayload, items: [{ id: product.id, quantity: 1 }] } })).status, 409);
  });

  await t.test('records revenue only for completed orders and reverses cancellation once', async () => {
    let dashboard = success(await admin.request('/api/admin/dashboard'));
    assert.equal(dashboard.summary.revenue, 0);
    success(await admin.request(`/api/admin/orders/${placedOrder.id}`, { method: 'PATCH', body: { status: 'completed' } }));
    dashboard = success(await admin.request('/api/admin/dashboard'));
    assert.equal(dashboard.summary.revenue, 180_000, 'Revenue excludes shipping and deducts the discount');
    assert.equal(dashboard.topProducts.find(row => row.id === product.id).quantity, 2);
    success(await admin.request(`/api/admin/orders/${placedOrder.id}`, { method: 'PATCH', body: { status: 'cancelled' } }));
    assert.equal(success(await admin.request('/api/admin/dashboard')).summary.revenue, 0);
    assert.equal(success(await anonymous.request('/api/products')).products.find(row => row.id === product.id).stock, 5);
    const secondCancellation = await admin.request(`/api/admin/orders/${placedOrder.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
    assert.ok(secondCancellation.status === 409 || (secondCancellation.status >= 200 && secondCancellation.status < 300));
    assert.equal(success(await anonymous.request('/api/products')).products.find(row => row.id === product.id).stock, 5);
    assert.equal((await admin.request(`/api/admin/orders/${placedOrder.id}`, { method: 'PATCH', body: { status: 'completed' } })).status, 409);
    invalid(await admin.request('/api/admin/dashboard?from=not-a-date'));
    invalid(await admin.request('/api/admin/dashboard?from=2026-12-31&to=2026-01-01'));
  });

  await t.test('prevents overselling when customers compete for the last item', async () => {
    success(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { stock: 1 } }));
    const payload = () => ({ items: [{ id: product.id, quantity: 1 }], customer: recipient, idempotencyKey: randomUUID() });
    const competing = await Promise.all([customer.request('/api/orders', { method: 'POST', body: payload() }), otherCustomer.request('/api/orders', { method: 'POST', body: payload() })]);
    assert.equal(competing.filter(response => response.status >= 200 && response.status < 300).length, 1);
    assert.equal(competing.filter(response => response.status === 409).length, 1);
    assert.equal(success(await anonymous.request('/api/products')).products.find(row => row.id === product.id).stock, 0);
  });

  await t.test('does not accept orders for withdrawn products', async () => {
    success(await admin.request(`/api/admin/products/${product.id}`, { method: 'PATCH', body: { active: false, stock: 3 } }));
    const response = await customer.request('/api/orders', { method: 'POST', body: { items: [{ id: product.id, quantity: 1 }], customer: recipient, idempotencyKey: randomUUID() } });
    assert.ok([400, 404, 409, 422].includes(response.status), response.text);
  });

  await t.test('retains accounts, product changes and orders after restarting', async () => {
    const customerOrders = success(await customer.request('/api/orders')).orders;
    await stopServer();
    await startServer();
    const freshCustomer = client(baseUrl);
    success(await freshCustomer.request('/api/auth/login', { method: 'POST', body: { username: 'KHACHHANG', password: '12345678' } }));
    assert.deepEqual(success(await freshCustomer.request('/api/orders')).orders.map(order => order.code), customerOrders.map(order => order.code));
    success(await admin.request('/api/auth/login', { method: 'POST', body: { username: 'admin.test', password } }));
    const persistedProduct = success(await admin.request('/api/admin/products')).products.find(row => row.id === product.id);
    assert.equal(persistedProduct.active, false);
    assert.equal(persistedProduct.stock, 3);
    for (const suffix of ['', '-wal']) {
      let bytes;
      try { bytes = await readFile(databasePath + suffix); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      assert.ok(!bytes.includes(Buffer.from(password)), 'Database must not contain an administrator password in plaintext');
      assert.ok(!bytes.includes(Buffer.from('12345678')), 'Database must not contain a customer password in plaintext');
    }
  });
});
