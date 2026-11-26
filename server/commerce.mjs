import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './security.mjs';
import { listProducts, productFromRow, orderFromRow, transaction } from './database.mjs';

const categories = { manga: 'Manga', manhwa: 'Manhwa', manhua: 'Manhua', 'light-novel': 'Light novel' };

function text(value, name, min, max) {
  if (typeof value !== 'string') throw new HttpError(400, `Vui lòng nhập ${name}.`);
  const result = value.trim().normalize('NFC');
  if ([...result].length < min || [...result].length > max) throw new HttpError(400, `${name} cần từ ${min} đến ${max} ký tự.`);
  return result;
}

function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new HttpError(400, `${name} phải là số nguyên từ ${minimum} đến ${maximum}.`);
  return value;
}

export function validateProduct(input, root) {
  const series = text(input.series, 'tên bộ truyện', 1, 120);
  const volume = text(input.volume, 'tập hoặc phiên bản', 1, 80);
  const author = text(input.author, 'tác giả', 1, 100);
  const description = text(input.description, 'mô tả', 1, 3000);
  if (!Object.hasOwn(categories, input.category)) throw new HttpError(400, 'Thể loại không hợp lệ.');
  if (!['single', 'boxset'].includes(input.format)) throw new HttpError(400, 'Định dạng không hợp lệ.');
  const price = integer(input.price, 'Giá bán', 1, 100000000);
  const originalPrice = input.originalPrice ?? price;
  integer(originalPrice, 'Giá gốc', 0, 100000000);
  const stock = integer(input.stock, 'Tồn kho', 0, 1000000);
  if (typeof input.active !== 'boolean' || typeof input.featured !== 'boolean') throw new HttpError(400, 'Trạng thái sản phẩm không hợp lệ.');
  const image = text(input.image, 'đường dẫn ảnh', 1, 2048);
  if (image.startsWith('assets/')) {
    if (!/^assets\/[a-zA-Z0-9_./-]+\.(svg|png|jpe?g|webp|avif|gif)$/i.test(image) || image.split('/').includes('..') || !existsSync(path.join(root, image))) {
      throw new HttpError(400, 'Ảnh trong thư mục assets không tồn tại hoặc đường dẫn không hợp lệ.');
    }
  } else {
    let url;
    try { url = new URL(image); } catch { throw new HttpError(400, 'Ảnh cần là đường dẫn assets hoặc URL HTTPS.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new HttpError(400, 'Ảnh ngoài website phải dùng URL HTTPS.');
  }
  return {
    series, volume, author, description, image, price, originalPrice, stock,
    title: `${series} — ${volume}`,
    category: input.category,
    categoryLabel: categories[input.category],
    format: input.format,
    active: input.active,
    featured: input.featured,
    badge: typeof input.badge === 'string' ? text(input.badge || 'Có sẵn', 'nhãn sản phẩm', 1, 50) : 'Có sẵn',
    seriesStatus: typeof input.seriesStatus === 'string' ? text(input.seriesStatus || 'Đang phát hành', 'trạng thái bộ', 1, 80) : 'Đang phát hành'
  };
}

export function createProduct(db, input, root) {
  const values = validateProduct({ active: true, featured: false, ...input }, root);
  const slug = `${values.series}-${values.volume}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70).replace(/^-|-$/g, '');
  const id = `${slug || 'truyen'}-${randomBytes(4).toString('hex')}`;
  const releaseOrder = Number(db.prepare("SELECT COALESCE(MAX(json_extract(payload, '$.releaseOrder')), 0) AS latest FROM products").get().latest) + 1;
  const product = { ...values, id, releaseOrder, revision: 1 };
  db.prepare('INSERT INTO products (id, payload, stock, active) VALUES (?, ?, ?, ?)').run(id, JSON.stringify(product), product.stock, Number(product.active));
  return product;
}

export function updateProduct(db, id, input, root) {
  const existing = productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  if (!existing) throw new HttpError(404, 'Không tìm thấy sản phẩm.');
  if (input.revision !== undefined && input.revision !== existing.revision) {
    throw new HttpError(409, 'Sản phẩm hoặc tồn kho vừa thay đổi. Hãy đóng và mở lại biểu mẫu để dùng dữ liệu mới.');
  }
  const values = validateProduct({ ...existing, ...input }, root);
  const product = { ...values, id, releaseOrder: existing.releaseOrder, revision: existing.revision + 1 };
  db.prepare('UPDATE products SET payload = ?, stock = ?, active = ?, revision = revision + 1 WHERE id = ?').run(JSON.stringify(product), product.stock, Number(product.active), id);
  return product;
}

function normalizeOrder(input) {
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new HttpError(400, 'Giỏ hàng cần từ 1 đến 100 dòng sản phẩm.');
  const itemsById = new Map();
  for (const item of input.items) {
    if (!item || typeof item.id !== 'string' || item.id.length > 120) throw new HttpError(400, 'Mã sản phẩm không hợp lệ.');
    const quantity = integer(item.quantity, 'Số lượng', 1, 1000000);
    const total = (itemsById.get(item.id) || 0) + quantity;
    integer(total, 'Số lượng', 1, 1000000);
    itemsById.set(item.id, total);
  }
  const items = [...itemsById].sort(([a], [b]) => a.localeCompare(b)).map(([id, quantity]) => ({ id, quantity }));
  const coupon = input.coupon == null ? '' : String(input.coupon).trim().toUpperCase();
  if (coupon && coupon !== 'MUC10') throw new HttpError(400, 'Mã giảm giá không hợp lệ.');
  if (!input.customer || typeof input.customer !== 'object') throw new HttpError(400, 'Vui lòng nhập thông tin nhận hàng.');
  const customer = {
    name: text(input.customer.name, 'tên người nhận', 2, 80),
    phone: text(input.customer.phone, 'số điện thoại', 10, 10),
    address: text(input.customer.address, 'địa chỉ', 10, 300)
  };
  if (!/^0\d{9}$/.test(customer.phone)) throw new HttpError(400, 'Số điện thoại cần 10 chữ số và bắt đầu bằng 0.');
  if (typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.idempotencyKey)) throw new HttpError(400, 'Mã yêu cầu đặt hàng không hợp lệ. Vui lòng thử lại.');
  return { items, coupon, customer };
}

export function createOrder(db, user, input) {
  const normalized = normalizeOrder(input);
  const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  return transaction(db, () => {
    const previous = db.prepare('SELECT orders.*, users.username FROM orders JOIN users ON users.id = orders.user_id WHERE user_id = ? AND idempotency_key = ?').get(user.id, input.idempotencyKey);
    if (previous) {
      if (previous.request_hash !== requestHash) throw new HttpError(409, 'Yêu cầu này đã được dùng cho một nội dung đơn khác. Vui lòng tạo yêu cầu mới.');
      return { order: orderFromRow(previous), products: listProducts(db) };
    }
    const items = normalized.items.map(item => {
      const product = productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(item.id));
      if (!product?.active) throw new HttpError(409, 'Một sản phẩm đã được gỡ khỏi cửa hàng. Vui lòng kiểm tra lại giỏ.');
      if (product.stock < item.quantity) throw new HttpError(409, `${product.title} chỉ còn ${product.stock} sản phẩm.`);
      return { id: product.id, title: product.title, price: product.price, quantity: item.quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (!Number.isSafeInteger(subtotal)) throw new HttpError(400, 'Tổng tiền vượt giới hạn cho phép.');
    const discount = normalized.coupon === 'MUC10' ? Math.round(subtotal * 0.1) : 0;
    const shipping = subtotal - discount >= 300000 ? 0 : 25000;
    const totals = { subtotal, discount, shipping, total: subtotal - discount + shipping };
    const id = randomUUID();
    const code = `MUC-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const order = { id, code, createdAt, status: 'pending', username: user.username, customer: normalized.customer, items, coupon: normalized.coupon, totals };
    for (const item of items) db.prepare('UPDATE products SET stock = stock - ?, revision = revision + 1 WHERE id = ?').run(item.quantity, item.id);
    db.prepare('INSERT INTO orders (id, code, user_id, created_at, status, payload, idempotency_key, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, code, user.id, createdAt, 'pending', JSON.stringify(order), input.idempotencyKey, requestHash);
    return { order, products: listProducts(db) };
  });
}

export function listOrders(db, userId) {
  return db.prepare(`SELECT orders.*, users.username FROM orders JOIN users ON users.id = orders.user_id
    ${userId ? 'WHERE user_id = ?' : ''} ORDER BY created_at DESC, orders.id DESC`).all(...(userId ? [userId] : [])).map(orderFromRow);
}

export function updateOrder(db, id, status) {
  if (!['pending', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'Trạng thái đơn hàng không hợp lệ.');
  return transaction(db, () => {
    const existing = db.prepare('SELECT orders.*, users.username FROM orders JOIN users ON users.id = orders.user_id WHERE orders.id = ?').get(id);
    if (!existing) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
    if (existing.status === status) return orderFromRow(existing);
    if (existing.status === 'cancelled' || (existing.status === 'completed' && status === 'pending')) throw new HttpError(409, 'Không thể chuyển đơn sang trạng thái này.');
    if (status === 'cancelled') {
      for (const item of JSON.parse(existing.payload).items) db.prepare('UPDATE products SET stock = stock + ?, revision = revision + 1 WHERE id = ?').run(item.quantity, item.id);
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return orderFromRow({ ...existing, status });
  });
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Ngày lọc không hợp lệ.');
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Ngày lọc không hợp lệ.');
  return date.getTime();
}

export function dashboard(db, query) {
  const from = query.get('from') ? parseDate(query.get('from')) : -Infinity;
  const to = query.get('to') ? parseDate(query.get('to')) + 24 * 60 * 60 * 1000 : Infinity;
  if (from >= to) throw new HttpError(400, 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  const orders = listOrders(db).filter(order => Date.parse(order.createdAt) >= from && Date.parse(order.createdAt) < to);
  const completed = orders.filter(order => order.status === 'completed');
  const topProducts = new Map();
  for (const order of completed) {
    let discountLeft = order.totals.discount;
    order.items.forEach((item, index) => {
      const gross = item.price * item.quantity;
      const discount = index === order.items.length - 1 ? discountLeft : Math.min(discountLeft, Math.round(gross * order.totals.discount / order.totals.subtotal));
      discountLeft -= discount;
      const current = topProducts.get(item.id) || { id: item.id, title: item.title, quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += gross - discount;
      topProducts.set(item.id, current);
    });
  }
  const products = listProducts(db, true);
  return {
    summary: { revenue: completed.reduce((sum, order) => sum + order.totals.subtotal - order.totals.discount, 0), orders: orders.length, products: products.length, publishedProducts: products.filter(product => product.active).length },
    orders,
    topProducts: [...topProducts.values()].sort((a, b) => b.revenue - a.revenue)
  };
}
