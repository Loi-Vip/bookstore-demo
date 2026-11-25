/* Browser-only demo store. Checkout is simulated; no data is transmitted. */
(() => {
  'use strict';
  const products = window.COMIC_CATALOG;
  const aliases = window.COMIC_ID_ALIASES || {};
  const resolveId = id => Object.hasOwn(aliases, id) ? aliases[id] : id;
  const keys = { cart: 'muc-comics-cart-v1', wishlist: 'muc-comics-wishlist-v1', orders: 'muc-comics-orders-v1', theme: 'muc-comics-theme-v1' };
  let storageAvailable = true;
  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return fallback;
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return parsed;
      let migrated = parsed;
      if (key === keys.cart) migrated = parsed.map(item => item && typeof item === 'object' ? { ...item, id: resolveId(item.id) } : item);
      if (key === keys.wishlist) migrated = parsed.map(resolveId);
      if (key === keys.orders) migrated = parsed.map(order => {
        if (!order || !Array.isArray(order.items)) return order;
        return { ...order, items: order.items.map(item => {
          if (!item || typeof item !== 'object') return item;
          const product = products.find(product => product.id === resolveId(item.id));
          return product ? { ...item, id: product.id, title: product.title } : item;
        }) };
      });
      if (JSON.stringify(parsed) !== JSON.stringify(migrated)) write(key, migrated);
      return migrated;
    }
    catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { storageAvailable = false; return false; }
  }
  const byId = id => products.find(product => product.id === resolveId(id));
  const savedCart = read(keys.cart, []);
  const merged = new Map();
  if (Array.isArray(savedCart)) savedCart.forEach(item => {
    const product = item && byId(item.id);
    if (product && product.stock > 0 && Number.isInteger(item.quantity) && item.quantity > 0) {
      merged.set(item.id, Math.min(product.stock, (merged.get(item.id) || 0) + item.quantity));
    }
  });
  let cart = Array.from(merged, ([id, quantity]) => ({ id, quantity }));
  const savedWishlist = read(keys.wishlist, []);
  let wishlist = Array.isArray(savedWishlist) ? [...new Set(savedWishlist.filter(id => byId(id)))] : [];
  const savedOrders = read(keys.orders, []);
  let orders = Array.isArray(savedOrders) ? savedOrders.filter(order => order && typeof order.code === 'string' && !Number.isNaN(Date.parse(order.createdAt)) && Array.isArray(order.items) && order.items.every(item => item && typeof item.title === 'string' && Number.isInteger(item.quantity) && item.quantity > 0) && Number.isFinite(order.totals?.total)).slice(0, 30) : [];
  let coupon = '';
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

  function sync() {
    // Re-read immediately before mutations so an older tab cannot overwrite a newer cart.
    if (!storageAvailable) return;
    const incoming = read(keys.cart, []);
    const quantities = new Map();
    if (Array.isArray(incoming)) incoming.forEach(item => {
      const product = item && byId(item.id);
      if (product && product.stock > 0 && Number.isInteger(item.quantity) && item.quantity > 0) quantities.set(item.id, Math.min(product.stock, (quantities.get(item.id) || 0) + item.quantity));
    });
    cart = Array.from(quantities, ([id, quantity]) => ({ id, quantity }));
    const incomingWishlist = read(keys.wishlist, []);
    wishlist = Array.isArray(incomingWishlist) ? [...new Set(incomingWishlist.filter(id => byId(id)))] : [];
    const incomingOrders = read(keys.orders, []);
    orders = Array.isArray(incomingOrders) ? incomingOrders.filter(order => order && typeof order.code === 'string' && !Number.isNaN(Date.parse(order.createdAt)) && Array.isArray(order.items) && order.items.every(item => item && typeof item.title === 'string' && Number.isInteger(item.quantity) && item.quantity > 0) && Number.isFinite(order.totals?.total)).slice(0, 30) : [];
    if (!cart.length) coupon = '';
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
    const sorts = { priceAsc: (a, b) => a.price - b.price, priceDesc: (a, b) => b.price - a.price, newest: (a, b) => b.releaseOrder - a.releaseOrder, title: (a, b) => a.title.localeCompare(b.title, 'vi'), featured: (a, b) => Number(b.featured) - Number(a.featured) || b.releaseOrder - a.releaseOrder };
    return result.sort(sorts[filters.sort] || sorts.featured);
  }
  function cartLines() { return cart.map(item => ({ ...item, product: byId(item.id) })); }
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
    if (!product || product.stock === 0) return { ok: false, message: 'Tập truyện này đang hết hàng.' };
    const item = cart.find(row => row.id === id);
    if (item && item.quantity >= product.stock) return { ok: false, message: 'Đã đạt số lượng còn trong kho mẫu.' };
    if (item) item.quantity += 1; else cart.push({ id, quantity: 1 });
    write(keys.cart, cart);
    return { ok: true, message: 'Đã thêm ' + product.series + ' · ' + product.volume + ' vào giỏ.' };
  }
  function change(id, delta) {
    sync();
    id = resolveId(id);
    if (!Number.isInteger(delta)) return false;
    const item = cart.find(row => row.id === id);
    if (!item) return false;
    const quantity = item.quantity + delta;
    if (quantity > byId(id).stock) return false;
    if (quantity <= 0) cart = cart.filter(row => row.id !== id); else item.quantity = quantity;
    if (!cart.length) coupon = '';
    write(keys.cart, cart); return true;
  }
  function remove(id) { sync(); id = resolveId(id); cart = cart.filter(item => item.id !== id); if (!cart.length) coupon = ''; write(keys.cart, cart); }
  function toggleWishlist(id) {
    sync();
    id = resolveId(id);
    if (!byId(id)) return false;
    const added = !wishlist.includes(id);
    wishlist = added ? [...wishlist, id] : wishlist.filter(value => value !== id);
    write(keys.wishlist, wishlist); return added;
  }
  function applyCoupon(value) {
    const code = String(value).trim().toUpperCase();
    if (!code) { coupon = ''; return { ok: true, message: 'Đã bỏ mã giảm giá.' }; }
    if (code !== 'MUC10') return { ok: false, message: coupon ? 'Mã không hợp lệ. MUC10 vẫn đang được áp dụng.' : 'Mã chưa đúng. Dùng MUC10 để thử giảm 10%.' };
    coupon = code;
    return { ok: true, message: 'Đã áp dụng MUC10 · Giảm 10% tiền truyện.' };
  }
  function checkout(customer) {
    sync();
    if (!cart.length) throw new Error('Giỏ hàng đang trống. Hãy chọn truyện trước nhé.');
    if (String(customer.name).trim().length < 2 || !/^0\d{9}$/.test(String(customer.phone)) || String(customer.address).trim().length < 10) throw new Error('Kiểm tra lại tên, số điện thoại và địa chỉ nhận hàng.');
    if (cart.some(item => item.quantity > byId(item.id).stock)) throw new Error('Số lượng vượt tồn kho mẫu. Hãy kiểm tra lại giỏ hàng.');
    const order = { code: 'MUC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase(), createdAt: new Date().toISOString(), items: cartLines().map(item => ({ id: item.id, title: item.product.title, quantity: item.quantity, price: item.product.price })), totals: totals() };
    // Store the order snapshot, never the demo recipient's personal details.
    const nextOrders = [order, ...orders].slice(0, 30);
    if (!write(keys.orders, nextOrders)) throw new Error('Trình duyệt đang chặn lưu dữ liệu. Giỏ hàng được giữ lại để bạn thử lại.');
    orders = nextOrders; cart = []; coupon = ''; write(keys.cart, cart); return order;
  }
  window.COMIC_STORE = { products, byId, query, normalize, sync, cartLines, totals, add, change, remove, toggleWishlist, applyCoupon, checkout,
    get cartCount() { return cart.reduce((sum, item) => sum + item.quantity, 0); },
    get wishlist() { return [...wishlist]; },
    get orders() { return structuredClone(orders); },
    get coupon() { return coupon; },
    get storageAvailable() { return storageAvailable; },
    get theme() { return read(keys.theme, 'light') === 'dark' ? 'dark' : 'light'; },
    setTheme(theme) { write(keys.theme, theme); }
  };
})();
