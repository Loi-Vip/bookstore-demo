/* Browser integration checks for the local Mực storefront. No real order is sent. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const defaultModule = 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || defaultModule);
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = path.resolve(__dirname, '../test-results');
const keys = { cart: 'muc-comics-cart-v1', wishlist: 'muc-comics-wishlist-v1', orders: 'muc-comics-orders-v1' };
const legacyNames = [
  'One Piece', 'Chú thuật hồi chiến', 'Spy × Family', 'Spy x Family', 'Chainsaw Man',
  'Solo Leveling', 'Toàn trí độc giả', 'Nhất Nhân Chi Hạ', 'Hồ Yêu Tiểu Hồng Nương',
  'Sword Art Online', 'Re:Zero', 'Thanh gươm diệt quỷ',
  'Eiichiro Oda', 'Gege Akutami', 'Tatsuya Endo', 'Tatsuki Fujimoto', 'Chugong', 'DUBU',
  'REDICE STUDIO', 'singNsong', 'Sleepy-C', 'Mi Er', 'Tuo Xiaoxin', 'Reki Kawahara',
  'Tappei Nagatsuki', 'Koyoharu Gotouge', 'Luffy', 'Yuji Itadori', 'Denji', 'Pochita',
  'Sung Jinwoo', 'Kirito', 'Aincrad', 'Subaru'
];
const previousDemoNames = [
  'Hải Đồ Thiên Vân', 'Trạm Điều Ước', 'Xóm Trọ Sao Băng', 'Thợ Máy Mùa Hạ',
  'Người Gác Cổng Mây', 'Đội Chuyển Thư Gió', 'Thư Viện Thủy Triều',
  'Bản Nhạc Giữa Tầng Không', 'Phố Đèn Lồng Xanh', 'Vườn Hoa Mùa Đông', 'Bước Chân Mùa Sao Rơi'
];
const expectedSeries = [
  'Two Piece', 'Chú Thuật Hồi Mân', 'Gia Đình Và Con Chó', 'Axe Man', 'Team Leveldown',
  'Thanh Gươm Diệt Vong', 'Cách Sử Dụng Chất Xám', 'Blade Paint Offline', 'Một Người Hạ Tay',
  'Hồ Yêu Bô Lão', 'Respawn To Two'
];
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
function assertNoPriorNames(text, label) {
  const normalized = normalize(text);
  const remaining = [...legacyNames, ...previousDemoNames].filter(name => normalized.includes(normalize(name)));
  assert.deepEqual(remaining, [], `${label} still contains prior series, author or character names: ${remaining.join(', ')}`);
}
const decodeXml = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
function svgSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? svgSources(filename) : entry.name.endsWith('.svg') ? [{ filename, text: fs.readFileSync(filename, 'utf8') }] : [];
  });
}
fs.mkdirSync(outputDir, { recursive: true });

let browser;
let checks = 0;
const errors = [];
const failedAssets = [];
const ok = message => { checks += 1; console.log(`PASS ${message}`); };

async function ready(page) {
  await page.waitForFunction(() => Boolean(window.COMIC_STORE && document.querySelector('#productGrid .product-card')));
}
async function open(page) { await page.goto(baseUrl, { waitUntil: 'networkidle' }); await ready(page); }
async function renderedIds(page) {
  return page.locator('#productGrid [data-add]').evaluateAll(buttons => buttons.map(button => button.dataset.add));
}
async function setCart(page, items) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: keys.cart, value: items });
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
}
async function closeDialog(page, selector) {
  if (await page.locator(selector).evaluate(dialog => dialog.open)) await page.locator(`${selector} [data-close]`).first().click();
}
async function amount(page, selector) {
  return Number((await page.locator(selector).innerText()).replace(/[^0-9]/g, ''));
}
async function noOverflow(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
  assert.ok(dimensions.body <= dimensions.viewport + 1 && dimensions.html <= dimensions.viewport + 1, `Overflow at ${width}px: ${JSON.stringify(dimensions)}`);
}

(async () => {
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(baseUrl) && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => { if (request.url().startsWith(baseUrl)) failedAssets.push(`${request.failure()?.errorText} ${request.url()}`); });
  await open(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);

  assert.equal(await page.title(), 'Mực — Cửa hàng truyện');
  assert.equal(await page.locator('#productGrid .product-card').count(), 14);
  const products = await page.evaluate(() => window.COMIC_STORE.products);
  assert.equal(new Set(products.map(product => product.id)).size, 14);
  assert.ok(products.every(product => product.image.startsWith('assets/')));
  await page.locator('#productGrid img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('#productGrid img')].every(img => img.complete && img.naturalWidth > 0));
  assert.deepEqual(failedAssets, []);
  ok('14 distinct products render using working local cover assets');

  assert.deepEqual([...new Set(products.map(product => product.series))].sort(), [...expectedSeries].sort());
  const storefrontText = await page.locator('main').innerText();
  expectedSeries.forEach(series => assert.ok(storefrontText.includes(series), `Storefront is missing requested series: ${series}`));
  products.forEach(product => assert.equal(product.title, `${product.series} — ${product.volume}`));
  assertNoPriorNames(storefrontText, 'Storefront text');
  assertNoPriorNames(JSON.stringify(products), 'Catalog data');
  const illustrations = svgSources(path.resolve(__dirname, '../assets'));
  assert.ok(illustrations.length >= 14, 'Expected at least fourteen local SVG cover illustrations');
  illustrations.forEach(({ filename, text }) => assertNoPriorNames(text, path.relative(outputDir, filename)));
  products.forEach(product => {
    const filename = path.resolve(__dirname, '..', product.image);
    const source = fs.readFileSync(filename, 'utf8');
    const svgTitle = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    assert.ok(svgTitle, `Cover is missing an accessible SVG title: ${product.image}`);
    assert.ok(decodeXml(svgTitle[1]).startsWith(product.title), `Cover title does not match ${product.title}`);
  });
  ok('all 11 requested series names match the catalog, rendered text and accessible SVG cover titles');

  await page.locator('#searchInput').fill('chu thuat hoi man');
  assert.deepEqual((await renderedIds(page)).sort(), ['chu-thuat-hoi-man-01', 'chu-thuat-hoi-man-02']);
  await page.locator('#searchInput').fill('khong co truyen nay 928');
  assert.equal(await page.locator('#productGrid .product-card').count(), 0);
  assert.equal(await page.locator('#emptyState').isVisible(), true);
  await page.locator('#emptyReset').click();
  assert.equal(await page.locator('#productGrid .product-card').count(), 14);
  ok('accent-insensitive search and empty/reset flow work');

  await page.locator('.category[data-category="manhwa"]').click();
  assert.deepEqual((await renderedIds(page)).sort(), ['cach-su-dung-chat-xam-01', 'team-leveldown-01']);
  await page.locator('#clearFilters').click();
  await page.locator('#boxsetFilter').click();
  assert.deepEqual(await renderedIds(page), ['thanh-guom-diet-vong-boxset-01']);
  await page.locator('#clearFilters').click();
  await page.locator('#stockFilter').check();
  assert.equal((await renderedIds(page)).length, 13);
  assert.ok(!(await renderedIds(page)).includes('two-piece-03'));
  await page.locator('#stockFilter').uncheck();
  for (const [sort, direction] of [['priceAsc', 1], ['priceDesc', -1]]) {
    await page.locator('#sortSelect').selectOption(sort);
    const ids = await renderedIds(page);
    const prices = ids.map(id => products.find(product => product.id === id).price);
    assert.ok(prices.every((value, index) => index === 0 || direction * (value - prices[index - 1]) >= 0));
  }
  await page.locator('#sortSelect').selectOption('featured');
  ok('category, boxset, in-stock filters and numeric price sorting work');

  await page.locator('#productGrid [data-detail="two-piece-01"]').first().click();
  await page.locator('#detailContent [data-volume="two-piece-02"]').click();
  assert.equal(await page.locator('#detailContent [data-add="two-piece-02"]').count(), 1);
  assert.ok((await page.locator('#detailContent .detail-meta').innerText()).includes('Tập 02'));
  await page.locator('#detailContent [data-add="two-piece-02"]').click();
  assert.deepEqual(await page.evaluate(() => window.COMIC_STORE.cartLines().map(({ id, quantity }) => ({ id, quantity }))), [{ id: 'two-piece-02', quantity: 1 }]);
  await page.locator('#detailContent [data-volume="two-piece-03"]').click();
  assert.equal(await page.locator('#detailContent [data-add="two-piece-03"]').isDisabled(), true);
  await closeDialog(page, '#detailDialog');
  await setCart(page, []);
  ok('detail volume selector adds the selected SKU and prevents buying an unavailable volume');

  await page.locator('#productGrid [data-favorite="chu-thuat-hoi-man-01"]').click();
  assert.equal((await page.locator('#wishlistCount').innerText()).trim(), '1');
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  assert.equal((await page.locator('#wishlistCount').innerText()).trim(), '1');
  assert.equal(await page.locator('#productGrid [data-favorite="chu-thuat-hoi-man-01"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#wishlistButton').click();
  assert.deepEqual(await renderedIds(page), ['chu-thuat-hoi-man-01']);
  await page.locator('#wishlistButton').click();
  assert.equal(await page.locator('#productGrid .product-card').count(), 14);
  ok('wishlist persists after reload and filters to saved titles');

  assert.equal(await page.locator('[data-add="two-piece-03"]').isDisabled(), true);
  await page.locator('#productGrid [data-add="two-piece-01"]').click();
  await page.locator('#productGrid [data-add="two-piece-02"]').click();
  await page.locator('#openCart').click();
  assert.equal(await page.locator('#cartItems .cart-row').count(), 2);
  await page.locator('#cartItems [data-quantity="two-piece-01"][data-delta="1"]').click();
  assert.deepEqual(await page.evaluate(() => window.COMIC_STORE.cartLines().map(({ id, quantity }) => ({ id, quantity }))), [{ id: 'two-piece-01', quantity: 2 }, { id: 'two-piece-02', quantity: 1 }]);
  assert.equal(await amount(page, '#cartSubtotal'), 75000);
  await closeDialog(page, '#cartDialog');
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  assert.equal((await page.locator('#cartCount').innerText()).trim(), '3');
  await page.locator('#openCart').click();
  await page.locator('#cartItems [data-remove="two-piece-02"]').click();
  assert.equal(await page.locator('#cartItems .cart-row').count(), 1);
  await page.locator('#cartItems [data-quantity="two-piece-01"][data-delta="-1"]').click();
  assert.equal(await amount(page, '#cartSubtotal'), 25000);
  await closeDialog(page, '#cartDialog');
  ok('cart keeps volume SKUs separate; quantity, remove and persistence agree with totals');

  await setCart(page, [{ id: 'axe-man-01', quantity: 7 }]);
  await page.locator('#openCart').click();
  await page.locator('#cartItems [data-quantity="axe-man-01"][data-delta="1"]').click();
  assert.equal(await page.evaluate(() => window.COMIC_STORE.cartCount), 8);
  const stockPlus = page.locator('#cartItems [data-quantity="axe-man-01"][data-delta="1"]');
  if (!(await stockPlus.isDisabled())) await stockPlus.click();
  assert.equal(await page.evaluate(() => window.COMIC_STORE.cartCount), 8);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.add('axe-man-01').ok), false);
  await closeDialog(page, '#cartDialog');
  ok('out-of-stock products cannot be bought and cart quantity cannot exceed stock');

  await setCart(page, [{ id: 'two-piece-01', quantity: 12 }]);
  await page.locator('#openCart').click();
  assert.equal(await amount(page, '#cartSubtotal'), 300000);
  assert.equal(await amount(page, '#cartShipping'), 0);
  await page.locator('#couponInput').fill('MUC10');
  await page.locator('#couponForm button').click();
  assert.equal(await amount(page, '#cartDiscount'), 30000);
  assert.equal(await amount(page, '#cartShipping'), 25000);
  assert.equal(await amount(page, '#cartTotal'), 295000);
  await page.locator('#cartItems [data-quantity="two-piece-01"][data-delta="1"]').click();
  await page.locator('#cartItems [data-quantity="two-piece-01"][data-delta="1"]').click();
  assert.equal(await amount(page, '#cartSubtotal'), 350000);
  assert.equal(await amount(page, '#cartDiscount'), 35000);
  assert.equal(await amount(page, '#cartShipping'), 0);
  assert.equal(await amount(page, '#cartTotal'), 315000);
  ok('MUC10 discount and shipping threshold calculate from the discounted amount');

  await page.locator('#checkoutButton').click();
  assert.equal(await amount(page, '#checkoutTotal'), 315000);
  await page.locator('#checkoutForm [name="name"]').fill('Người thử demo');
  await page.locator('#checkoutForm [name="phone"]').fill('123');
  await page.locator('#checkoutForm [name="address"]').fill('123 Đường Mẫu, Phường Mẫu, Hà Nội');
  await page.locator('#checkoutForm button[type="submit"]').click();
  assert.equal(await page.locator('#checkoutForm [name="phone"]').evaluate(input => input.validity.patternMismatch), true);
  assert.equal(await page.locator('#checkoutFormView').isVisible(), true);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.orders.length), 0);
  await page.locator('#checkoutForm [name="phone"]').fill('0901234567');
  await page.locator('#checkoutForm button[type="submit"]').click();
  assert.equal(await page.locator('#successView').isVisible(), true);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.cartCount), 0);
  const order = await page.evaluate(() => window.COMIC_STORE.orders[0]);
  assert.ok(order.code.startsWith('MUC-'));
  assert.equal(order.totals.total, 315000);
  assert.deepEqual(order.items.map(({ id, quantity }) => ({ id, quantity })), [{ id: 'two-piece-01', quantity: 14 }]);
  assert.ok(!JSON.stringify(order).includes('0901234567'));
  await page.locator('#continueButton').click();
  await page.locator('#productGrid [data-add="two-piece-02"]').click();
  await page.locator('#openCart').click();
  await page.locator('#checkoutButton').click();
  assert.equal(await page.locator('#checkoutFormView').isVisible(), true);
  assert.equal(await page.locator('#successView').isVisible(), false);
  await closeDialog(page, '#checkoutDialog');
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.orders.length), 1);
  await page.locator('#openOrders').click();
  assert.ok((await page.locator('#ordersList').innerText()).includes(order.code));
  await closeDialog(page, '#ordersDialog');
  ok('checkout blocks invalid phone, stores a mock order, clears cart and reopens a fresh form');

  await page.evaluate(storageKeys => {
    for (const key of Object.values(storageKeys)) localStorage.setItem(key, '{broken json');
  }, keys);
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.cartCount), 0);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.wishlist.length), 0);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.orders.length), 0);
  assert.equal(await page.locator('#productGrid .product-card').count(), 14);
  await page.evaluate(({ cartKey, wishlistKey }) => {
    localStorage.setItem(cartKey, JSON.stringify([{ id: 'no-such-product', quantity: 4 }, { id: 'two-piece-03', quantity: 1 }, { id: 'two-piece-01', quantity: 1000 }, { id: 'two-piece-01', quantity: 3 }, { id: 'chu-thuat-hoi-man-01', quantity: -2 }]));
    localStorage.setItem(wishlistKey, JSON.stringify(['no-such-product', 'chu-thuat-hoi-man-01', 'chu-thuat-hoi-man-01']));
  }, { cartKey: keys.cart, wishlistKey: keys.wishlist });
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  assert.equal(await page.evaluate(() => window.COMIC_STORE.cartCount), 36);
  assert.deepEqual(await page.evaluate(() => window.COMIC_STORE.wishlist), ['chu-thuat-hoi-man-01']);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await ready(page);
  ok('corrupt and tampered persisted data recover without breaking the page');

  await noOverflow(page, 1440);
  await page.screenshot({ path: path.join(outputDir, 'desktop.png'), fullPage: true });
  await noOverflow(page, 390);
  await page.screenshot({ path: path.join(outputDir, 'mobile-390.png'), fullPage: true });
  await page.locator('#productGrid [data-add="two-piece-01"]').click();
  await page.locator('#openCart').click();
  assert.equal(await page.locator('#cartDialog').isVisible(), true);
  await closeDialog(page, '#cartDialog');
  await noOverflow(page, 320);
  await page.screenshot({ path: path.join(outputDir, 'mobile-320.png'), fullPage: true });
  ok('desktop, 390px and 320px layouts have no horizontal page overflow; mobile cart works');

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  assert.deepEqual(failedAssets, [], `Asset failures: ${failedAssets.join('\n')}`);
  ok('no JavaScript errors or failed local requests');
  console.log(`\n${checks} integration checks passed. Screenshots: ${outputDir}`);
  await browser.close();
})().catch(async error => {
  console.error(error.stack || error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
