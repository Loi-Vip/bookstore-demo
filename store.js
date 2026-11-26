/* Catalog and cart state. Accounts and orders are stored by the server. */
(() => {
  'use strict';
  const filePreview = location.protocol === 'file:';
  let products = filePreview ? window.COMIC_CATALOG : [];
  let catalogReady = filePreview;
  const aliases = window.COMIC_ID_ALIASES || {};
  const resolveId = id => Object.hasOwn(aliases, id) ? aliases[id] : id;
  const keys = { cart: 'muc-comics-cart-v1', wishlist: 'muc-comics-wishlist-v1', theme: 'muc-comics-theme-v1' };
  const pendingKey = 'muc-comics-pending-checkout-v1';
  let storageAvailable = true;
  let user = null;
  let orders = [];
  let coupon = '';

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { storageAvailable = false; return false; }
  }
  function readPending() {
    try {
      const pending = JSON.parse(sessionStorage.getItem(pendingKey));
      const validItems = Array.isArray(pending?.items) && pending.items.every(item => item && typeof item.id === 'string' && Number.isInteger(item.quantity) && item.quantity > 0);
      const validProducts = Array.isArray(pending?.products) && pending.products.every(product => product && typeof product.id === 'string' && Number.isFinite(product.price));
      return validItems && validProducts && typeof pending.key === 'string' && typeof pending.signature === 'string' ? pending : null;
    } catch { return null; }
  }
  let pendingCheckout = readPending();
  if (pendingCheckout?.coupon === 'MUC10') coupon = 'MUC10';
  function forgetPending() {
    pendingCheckout = null;
    try { sessionStorage.removeItem(pendingKey); } catch {}
  }
  function rememberPending(value) {
    pendingCheckout = value;
    try { sessionStorage.setItem(pendingKey, JSON.stringify(value)); } catch {}
  }
  const byId = id => products.find(product => product.id === resolveId(id));
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

  function cleanCart(value, preservePending = false) {
    const merged = new Map();
    if (Array.isArray(value)) value.forEach(item => {
      if (!item || typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity <= 0) return;
      const id = resolveId(item.id);
      const product = byId(id);
      const pendingItem = preservePending && pendingCheckout?.items.some(saved => saved.id === id);
      if (catalogReady && !pendingItem && (!product || product.stock <= 0)) return;
      const limit = catalogReady && !pendingItem ? product.stock : 100000;
      merged.set(id, Math.min(limit, (merged.get(id) || 0) + item.quantity));
    });
    return Array.from(merged, ([id, quantity]) => ({ id, quantity }));
  }
  let cart = cleanCart(read(keys.cart, []), Boolean(pendingCheckout));
  const savedWishlist = read(keys.wishlist, []);
  let wishlist = Array.isArray(savedWishlist) ? [...new Set(savedWishlist.filter(id => typeof id === 'string').map(resolveId))] : [];

  function sync() {
    if (!storageAvailable) return;
    cart = cleanCart(read(keys.cart, []), Boolean(pendingCheckout));
    const incomingWishlist = read(keys.wishlist, []);
    wishlist = Array.isArray(incomingWishlist) ? [...new Set(incomingWishlist.filter(id => typeof id === 'string').map(resolveId))] : [];
    if (!cart.length) coupon = '';
  }
  function replaceProducts(nextProducts, options = {}) {
    if (!Array.isArray(nextProducts)) throw new Error('Danh mục trả về không hợp lệ.');
    products = nextProducts.filter(product => product && typeof product.id === 'string' && product.active !== false);
    catalogReady = true;
    cart = cleanCart(cart, options.preserveCart || Boolean(pendingCheckout));
    wishlist = wishlist.filter(id => byId(id));
    write(keys.cart, cart);
    write(keys.wishlist, wishlist);
  }
  function query(filters = {}) {
    const words = normalize(filters.search || '').trim().split(/\s+/).filter(Boolean);
    const result = products.filter(product => {
      const haystack = normalize([product.title, product.series, product.author, product.categoryLabel, product.volume].join(' '));
      return (!filters.category || filters.category === 'all' || product.category === filters.category)
        && (!filters.format || product.format === filters.format)
        && (!filters.inStock || product.stock > 0)
        && (!filters.wishlistOnly || wishlist.includes(product.id))
        && words.every(word => haystack.includes(word));
    });
    const sorts = {
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      newest: (a, b) => b.releaseOrder - a.releaseOrder,
      title: (a, b) => a.title.localeCompare(b.title, 'vi'),
      featured: (a, b) => Number(b.featured) - Number(a.featured) || b.releaseOrder - a.releaseOrder
    };
    return result.sort(sorts[filters.sort] || sorts.featured);
  }
  function cartLines() {
    return cart.map(item => ({ ...item, product: byId(item.id) || pendingCheckout?.products?.find(product => product.id === item.id) })).filter(item => item.product);
  }
  function totals() {
    const subtotal = cartLines().reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const discount = coupon === 'MUC10' ? Math.round(subtotal * 0.1) : 0;
    const shipping = subtotal === 0 || subtotal - discount >= 300000 ? 0 : 25000;
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
  }
  function add(id) {
    sync();
    id = resolveId(id);
    const product = byId(id);
    if (!product || product.stock <= 0) return { ok: false, message: 'Tập truyện này đang hết hàng hoặc đã được gỡ.' };
    const item = cart.find(row => row.id === id);
    if (item && item.quantity >= product.stock) return { ok: false, message: 'Đã đạt số lượng còn trong kho.' };
    forgetPending();
    if (item) item.quantity += 1; else cart.push({ id, quantity: 1 });
    write(keys.cart, cart);
    return { ok: true, message: 'Đã thêm ' + product.series + ' · ' + product.volume + ' vào giỏ.' };
  }
  function change(id, delta) {
    sync();
    id = resolveId(id);
    if (!Number.isInteger(delta)) return false;
    const item = cart.find(row => row.id === id);
    const product = byId(id);
    if (!item || !product) return false;
    const quantity = item.quantity + delta;
    if (quantity > product.stock) return false;
    forgetPending();
    if (quantity <= 0) cart = cart.filter(row => row.id !== id); else item.quantity = quantity;
    if (!cart.length) coupon = '';
    write(keys.cart, cart);
    return true;
  }
  function remove(id) {
    sync();
    forgetPending();
    id = resolveId(id);
    cart = cart.filter(item => item.id !== id);
    if (!cart.length) coupon = '';
    write(keys.cart, cart);
  }
  function toggleWishlist(id) {
    sync();
    id = resolveId(id);
    if (!byId(id)) return false;
    const added = !wishlist.includes(id);
    wishlist = added ? [...wishlist, id] : wishlist.filter(value => value !== id);
    write(keys.wishlist, wishlist);
    return added;
  }
  function applyCoupon(value) {
    const code = String(value).trim().toUpperCase();
    if (code && code !== 'MUC10') return { ok: false, message: coupon ? 'Mã không hợp lệ. MUC10 vẫn đang được áp dụng.' : 'Mã chưa đúng. Dùng MUC10 để giảm 10%.' };
    if (code !== coupon) forgetPending();
    coupon = code;
    return { ok: true, message: code ? 'Đã áp dụng MUC10 · Giảm 10% tiền truyện.' : 'Đã bỏ mã giảm giá.' };
  }
  function setUser(nextUser) {
    if (user?.id !== nextUser?.id) orders = [];
    user = nextUser;
    if (pendingCheckout && user && pendingCheckout.userId !== user.id) forgetPending();
  }
  async function loadOrders() {
    orders = [];
    if (!user) return [];
    const requestedUserId = user.id;
    const result = await window.MUC_API.request('/api/orders');
    if (user?.id === requestedUserId) orders = result.orders;
    return structuredClone(orders);
  }
  async function checkout(customer) {
    if (filePreview) throw new Error('Hãy mở website bằng máy chủ để đăng nhập và đặt hàng.');
    if (!user) throw new Error('Vui lòng đăng nhập trước khi đặt hàng.');
    if (!crypto.subtle || !crypto.randomUUID) throw new Error('Hãy sử dụng HTTPS hoặc localhost để đặt hàng trên trình duyệt này.');
    sync();
    if (!cart.length) throw new Error('Giỏ hàng đang trống. Hãy chọn truyện trước nhé.');
    const items = cart.map(item => ({ id: item.id, quantity: item.quantity }));
    const signatureSource = JSON.stringify({ userId: user.id, items, coupon, customer });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signatureSource));
    const signature = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    if (!pendingCheckout || pendingCheckout.signature !== signature || pendingCheckout.userId !== user.id) {
      rememberPending({ key: crypto.randomUUID(), signature, userId: user.id, items, coupon, products: cartLines().map(item => item.product) });
    }
    const requestedUserId = user.id;
    const idempotencyKey = pendingCheckout.key;
    let result;
    try {
      result = await window.MUC_API.request('/api/orders', {
        method: 'POST', body: { items, coupon, customer, idempotencyKey }
      });
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 429) forgetPending();
      throw error;
    }
    if (user?.id === requestedUserId) orders = [result.order, ...orders.filter(order => order.id !== result.order.id)];
    // Keep additions made in another tab while the order request was in flight.
    sync();
    const purchased = new Map(items.map(item => [item.id, item.quantity]));
    cart = cart.map(item => ({ id: item.id, quantity: item.quantity - (purchased.get(item.id) || 0) })).filter(item => item.quantity > 0);
    coupon = '';
    forgetPending();
    write(keys.cart, cart);
    if (result.products) replaceProducts(result.products);
    return result.order;
  }
  window.COMIC_STORE = {
    byId, query, normalize, sync, replaceProducts, cartLines, totals, add, change, remove, toggleWishlist, applyCoupon,
    checkout, loadOrders, setUser,
    get products() { return products; },
    get cartCount() { return cart.reduce((sum, item) => sum + item.quantity, 0); },
    get wishlist() { return [...wishlist]; },
    get orders() { return structuredClone(orders); },
    get coupon() { return coupon; },
    get user() { return user; },
    get hasPendingCheckout() { return Boolean(pendingCheckout); },
    get filePreview() { return filePreview; },
    get storageAvailable() { return storageAvailable; },
    get theme() { return read(keys.theme, 'light') === 'dark' ? 'dark' : 'light'; },
    setTheme(theme) { write(keys.theme, theme); }
  };
})();
