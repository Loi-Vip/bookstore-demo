const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const bundledModules = 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || bundledModules);
const project = path.resolve(__dirname, '..');
const temporaryRoot = path.resolve(os.tmpdir());
const password = 'KhachHang123!';

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function noHorizontalOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.body <= size.viewport + 1 && size.document <= size.viewport + 1, `${label} overflows horizontally: ${JSON.stringify(size)}`);
}

async function signIn(page, baseUrl, username, next = '/') {
  const route = next.startsWith('/admin') ? '/admin/login' : `/auth.html?next=${encodeURIComponent(next)}`;
  await page.goto(baseUrl + route, { waitUntil: 'networkidle' });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#authSubmit').click();
  await page.waitForURL(url => next.startsWith('/admin') ? url.pathname === '/admin' || url.pathname === '/admin/' : url.pathname === '/');
}

(async () => {
  const databaseDirectory = await fs.mkdtemp(path.join(temporaryRoot, 'muc-auth-ui-'));
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['serve.mjs', String(port)], {
    cwd: project,
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DB_PATH: path.join(databaseDirectory, 'store.sqlite'), ADMIN_USERNAME: 'admin.ui', ADMIN_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', chunk => { serverLog += chunk; });
  server.stderr.on('data', chunk => { serverLog += chunk; });
  let browser;
  let passed = 0;
  const ok = label => { passed += 1; console.log(`PASS ${label}`); };
  try {
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Server exited before startup.\n${serverLog}`);
      try { if ((await fetch(baseUrl + '/api/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 75));
    }
    assert.ok(ready, `Server failed to start.\n${serverLog}`);
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    customerContext.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    adminContext.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const customer = await customerContext.newPage();
    const admin = await customerContext.newPage();
    const output = path.join(project, 'test-results', 'accounts');
    await fs.mkdir(output, { recursive: true });

    await admin.goto(baseUrl + '/admin', { waitUntil: 'networkidle' });
    await admin.waitForURL(url => url.pathname === '/admin/login');
    await admin.locator('#adminLoginForm').waitFor({ state: 'visible' });
    assert.equal(await admin.locator('#registerTab').count(), 0);
    await admin.goto(baseUrl + '/auth.html?next=/admin', { waitUntil: 'networkidle' });
    await admin.waitForURL(url => url.pathname === '/admin/login');
    await admin.locator('#adminLoginForm').waitFor({ state: 'visible' });
    await admin.screenshot({ path: path.join(output, 'admin-login-desktop.png'), fullPage: true });
    ok('administration entry points open a dedicated administrator login page');

    await customer.goto(baseUrl + '/auth.html?mode=register', { waitUntil: 'networkidle' });
    await customer.locator('#username').fill('customer.ui');
    await customer.locator('#password').fill('1234567');
    await customer.locator('#passwordConfirmation').fill('1234567');
    await customer.locator('#authSubmit').click();
    assert.equal(await customer.locator('#password').evaluate(input => input.validity.tooShort), true);
    await customer.locator('#password').fill(password);
    await customer.locator('#passwordConfirmation').fill('Different123!');
    await customer.locator('#authSubmit').click();
    assert.equal(await customer.locator('#passwordConfirmation').evaluate(input => input.validity.customError), true);
    await customer.locator('#passwordConfirmation').fill(password);
    await customer.locator('#passwordToggle').click();
    assert.equal(await customer.locator('#password').getAttribute('type'), 'text');
    await customer.locator('#passwordToggle').click();
    await customer.screenshot({ path: path.join(output, 'registration.png'), fullPage: true });
    await customer.locator('#authSubmit').click();
    await customer.waitForURL(url => url.pathname === '/');
    await customer.waitForFunction(() => Boolean(window.COMIC_STORE && document.querySelector('#productGrid .product-card')));
    const signedIn = await customer.evaluate(() => window.MUC_API.request('/api/auth/me'));
    assert.equal(signedIn.user.username, 'customer.ui');
    assert.equal(signedIn.user.role, 'customer');
    assert.ok(!(await customer.evaluate(() => JSON.stringify(localStorage))).includes(password));
    ok('customer registration validates password length and confirmation then signs in');

    const duplicate = await adminContext.newPage();
    await duplicate.goto(baseUrl + '/auth.html?mode=register', { waitUntil: 'networkidle' });
    await duplicate.locator('#username').fill('CUSTOMER.UI');
    await duplicate.locator('#password').fill(password);
    await duplicate.locator('#passwordConfirmation').fill(password);
    await duplicate.locator('#authSubmit').click();
    await duplicate.waitForFunction(() => document.querySelector('#authError').textContent.trim().length > 0);
    assert.equal(new URL(duplicate.url()).pathname, '/auth.html');
    assert.equal(await duplicate.locator('#authSubmit').isDisabled(), false);
    await duplicate.close();
    ok('duplicate usernames show a usable registration error');

    await customer.goto(baseUrl + '/admin', { waitUntil: 'networkidle' });
    await customer.waitForURL(url => url.pathname === '/admin/login');
    await customer.locator('#adminLoginForm').waitFor({ state: 'visible' });
    await customer.locator('#username').fill('customer.ui');
    await customer.locator('#password').fill(password);
    await customer.locator('#authSubmit').click();
    await customer.waitForFunction(() => document.querySelector('#authError').textContent.trim().length > 0);
    assert.equal(new URL(customer.url()).pathname, '/admin/login');
    assert.equal(await customer.locator('#authSubmit').isDisabled(), false);
    assert.equal((await customer.evaluate(() => window.MUC_API.request('/api/auth/me'))).user.username, 'customer.ui');
    assert.equal((await customer.evaluate(() => window.MUC_API.request('/api/admin/auth/me'))).user, null);
    ok('customer credentials show an administrator login error and preserve the customer session');

    await signIn(admin, baseUrl, 'admin.ui', '/admin');
    await admin.locator('#adminShell').waitFor({ state: 'visible' });
    await admin.waitForFunction(() => document.querySelector('#productCount').textContent === '14');
    assert.equal((await admin.evaluate(() => window.MUC_API.request('/api/auth/me'))).user.username, 'customer.ui');
    assert.equal((await admin.evaluate(() => window.MUC_API.request('/api/admin/auth/me'))).user.username, 'admin.ui');
    await customer.goto(baseUrl + '/admin/login', { waitUntil: 'networkidle' });
    await customer.waitForURL(url => url.pathname === '/admin');
    await customer.locator('#adminShell').waitFor({ state: 'visible' });
    ok('administrator and customer stay signed in together in one browser');
    await admin.locator('#newProductButton').click();
    const fields = { series: 'Truyện UI thử nghiệm', volume: 'Tập 01', author: 'Tác giả UI', price: '50000', stock: '3', image: 'assets/covers/two-piece-01.svg', description: 'Nội dung minh họa để kiểm tra thao tác đăng sản phẩm.' };
    for (const [name, value] of Object.entries(fields)) await admin.locator(`#productForm [name="${name}"]`).fill(value);
    await admin.locator('#saveProductButton').click();
    await admin.locator('#productDialog').waitFor({ state: 'hidden' });
    await admin.waitForFunction(() => document.querySelector('#productCount').textContent === '15');
    const products = await admin.evaluate(() => window.MUC_API.request('/api/admin/products'));
    const product = products.products.find(item => item.series === fields.series);
    assert.ok(product);
    ok('administrator signs in and publishes a new product from the form');

    await customer.goto(baseUrl, { waitUntil: 'networkidle' });
    await customer.locator(`#productGrid [data-add="${product.id}"]`).waitFor();
    await customer.locator(`#productGrid [data-add="${product.id}"]`).click();
    await customer.locator('#openCart').click();
    await customer.locator('#checkoutButton').click();
    await customer.locator('#checkoutForm [name="name"]').fill('Khách thử UI');
    await customer.locator('#checkoutForm [name="phone"]').fill('0901234567');
    await customer.locator('#checkoutForm [name="address"]').fill('123 Đường Mẫu, Phường Mẫu, Hà Nội');
    await customer.locator('#checkoutForm button[type="submit"]').click();
    await customer.locator('#successView').waitFor({ state: 'visible' });
    const orderCode = await customer.locator('#orderCode').innerText();
    assert.ok(orderCode.startsWith('MUC-'));
    await customer.locator('#continueButton').click();
    await customer.locator('#openOrders').click();
    await customer.waitForFunction(code => document.querySelector('#ordersList').textContent.includes(code), orderCode);
    assert.equal(await customer.evaluate(() => window.COMIC_STORE.cartCount), 0);
    ok('signed-in customer orders a published product and sees personal order history');

    await admin.locator('#refreshButton').click();
    await admin.locator('#orderRows [data-order]').first().waitFor();
    assert.equal((await admin.locator('#revenueValue').innerText()).replace(/\D/g, ''), '0');
    await admin.locator('#orderRows [data-order]').first().click();
    await admin.locator('#orderStatus').selectOption('completed');
    await admin.locator('#saveOrderStatus').click();
    await admin.waitForFunction(() => document.querySelector('#revenueValue').textContent.replace(/\D/g, '') === '50000');
    await admin.locator('#orderDialog [data-close]').first().click();
    await admin.locator(`[data-toggle-product="${product.id}"]`).click();
    await admin.waitForFunction(() => document.querySelector('#publishedCount').textContent === '14');
    await customer.locator('#ordersDialog [data-close]').first().click();
    await customer.reload({ waitUntil: 'networkidle' });
    await customer.waitForFunction(() => Boolean(window.COMIC_STORE && document.querySelector('#productGrid .product-card')));
    assert.equal(await customer.locator(`#productGrid [data-add="${product.id}"]`).count(), 0);
    await admin.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    await admin.screenshot({ path: path.join(output, 'admin-desktop.png'), fullPage: true });
    ok('completed orders affect revenue and withdrawn products leave the storefront');

    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    await noHorizontalOverflow(admin, 'Mobile administration');
    await admin.screenshot({ path: path.join(output, 'admin-mobile.png'), fullPage: true });
    await customer.goto(baseUrl + '/auth.html', { waitUntil: 'networkidle' });
    await customer.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(customer, 'Mobile authentication');
    await customer.screenshot({ path: path.join(output, 'login-mobile.png'), fullPage: true });
    await customer.evaluate(() => window.MUC_API.request('/api/auth/logout', { method: 'POST', body: {} }));
    assert.equal((await admin.evaluate(() => window.MUC_API.request('/api/admin/auth/me'))).user.username, 'admin.ui');
    await signIn(customer, baseUrl, 'customer.ui');
    ok('customer logout and login preserve the administrator session');
    await admin.locator('#logoutButton').click();
    await admin.waitForURL(url => url.pathname === '/admin/login');
    await admin.locator('#adminLoginForm').waitFor({ state: 'visible' });
    await noHorizontalOverflow(admin, 'Mobile administrator login');
    await admin.screenshot({ path: path.join(output, 'admin-login-mobile.png'), fullPage: true });
    assert.equal((await customer.evaluate(() => window.MUC_API.request('/api/auth/me'))).user.username, 'customer.ui');
    assert.equal((await admin.evaluate(() => window.MUC_API.request('/api/admin/auth/me'))).user, null);
    await admin.goto(baseUrl + '/admin', { waitUntil: 'networkidle' });
    await admin.waitForURL(url => url.pathname === '/admin/login');
    await admin.locator('#adminLoginForm').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    ok('mobile pages fit their viewport and administrator logout preserves the customer session');
    console.log(`\n${passed} account and management browser checks passed.`);
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
    const resolved = path.resolve(databaseDirectory);
    assert.ok(resolved.startsWith(temporaryRoot + path.sep));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
